import { useCallback, useEffect, useRef, useState } from 'react';
import { applyBackfills } from '../services/backfill.js';
import { pullSave, pushSave, subscribeSaves, upsertProfile } from '../services/cloudSync.js';
import { logError } from '../services/logger.js';
import {
  clearSyncMeta,
  hasMeaningfulData,
  loadFromLocalStorage,
  loadSyncMeta,
  migrateIfNeeded,
  saveSyncMeta,
  saveToLocalStorage,
  semanticHashState,
  writeSnapshot,
} from '../services/persistence.js';

const LOCAL_DEBOUNCE_MS = 500;
// Phase 37d QA round-6 suggestion: bumped cloud debounce from 500ms → 1500ms
// to cluster bursts of setState (e.g., answer-event triggers recordAnswer +
// updateTomeProgress + awardXP + checkAchievement in quick succession). The
// 500ms window often missed the trailing edge of such a cluster — observed
// as up to 4 POSTs to /rest/v1/saves per answer. Local save stays at 500ms
// and the beforeunload flush still fires synchronously, so crash-safety is
// unaffected.
const CLOUD_DEBOUNCE_MS = 1500;
const RETRY_DELAYS_MS = [1000, 4000, 16000];
const BROADCAST_CHANNEL = 'dungeon-scholar:state';

/**
 * Combined local + cloud persistence hook.
 *
 * Local: every change is debounced ~500 ms to localStorage. Always on.
 * Cloud: when signed in, every change is debounced ~500 ms to Supabase.
 *
 * Live updates:
 *   - BroadcastChannel: same browser, other tabs apply changes immediately.
 *   - Supabase Realtime: other devices apply changes when their saves row changes.
 *
 * Sign-in pull (smart merge using sync meta):
 *   - empty cloud + empty local                    → no-op
 *   - cloud has data + empty local                 → cloud wins silently
 *   - empty cloud + local has data                 → push local silently
 *   - both have data, never synced before          → CHOOSER (real first-time conflict)
 *   - both have data, cloud unchanged since sync   → push if local is dirty, else no-op
 *   - both have data, cloud changed, local clean   → cloud wins silently
 *   - both have data, cloud changed, local dirty   → CHOOSER (real concurrent conflict)
 *
 * @param defaultState  initial blob if nothing is stored anywhere
 * @param user user record (id, githubLogin, avatarUrl) or null
 * @returns [state, setState, sync]
 *   sync = { mergeRequired, localPreview, cloudPreview, resolveMerge, status, lastSyncedAt }
 */
export function usePlayerState(defaultState, user = null) {
  const [state, setStateInternal] = useState(() => {
    const stored = loadFromLocalStorage();
    if (!stored) return defaultState;
    // loadFromLocalStorage returns { state, schemaVer } — pass the actual
    // stored version through so v0 saves get the v0→v1 tutorial migration.
    // applyBackfills then reconciles state mutated by historical bugs
    // (idempotent — gated on state.backfillVer).
    const migrated = migrateIfNeeded(stored.state, stored.schemaVer);
    return applyBackfills(migrated);
  });

  const [mergeRequired, setMergeRequired] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);
  const [cloudPreview, setCloudPreview] = useState(null);
  const [status, setStatus] = useState('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => loadSyncMeta().lastSyncedAt);
  // M10 (17F): sticky flag — set the first time a local save fails (quota /
  // private mode). Stickiness IS the de-dupe: the App-level toast fires once.
  const [localSaveFailed, setLocalSaveFailed] = useState(false);
  const noteSaveResult = (res) => {
    if (res && res.ok === false) setLocalSaveFailed(true);
  };

  const latestRef = useRef(state);
  const localTimeoutRef = useRef(null);
  const cloudTimeoutRef = useRef(null);
  const retryAttemptRef = useRef(0);
  // Track the cloud's most recent updated_at known to this client. Used to
  // dedupe Realtime echoes of our own pushes.
  const lastKnownCloudUpdatedAtRef = useRef(null);
  // Rolling ring buffer of JSON fingerprints of recent local states. When a
  // Realtime echo arrives, if the incoming cloud snapshot matches a state we
  // ever held locally, it's a self-echo (or a stale delivery overtaken by a
  // newer local change) and must be ignored — applying it would revert work.
  const recentLocalHashesRef = useRef([]);
  const broadcastChannelRef = useRef(null);
  // When applying a remote update (from BroadcastChannel or Realtime),
  // bypass the public setState's side effects (push, broadcast).
  const applyingRemoteRef = useRef(false);

  const trackLocalHash = (s) => {
    try {
      const hash = JSON.stringify(s);
      const buf = recentLocalHashesRef.current;
      buf.push(hash);
      if (buf.length > 50) buf.shift();
    } catch {
      /* ignore stringify failures (cyclic, etc.) */
    }
  };

  const userRef = useRef(user);
  const userId = user?.id ?? null;
  useEffect(() => {
    userRef.current = user;
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const writeSyncMeta = useCallback((meta) => {
    saveSyncMeta(meta);
    setLastSyncedAt(meta.lastSyncedAt);
  }, []);

  // Apply a state from a remote source (Realtime or another tab) without
  // triggering broadcast/push back out.
  const applyRemoteState = useCallback(
    (nextState, cloudUpdatedAt) => {
      applyingRemoteRef.current = true;
      try {
        latestRef.current = nextState;
        setStateInternal(nextState);
        trackLocalHash(nextState);
        noteSaveResult(saveToLocalStorage(nextState));
        if (cloudUpdatedAt) {
          lastKnownCloudUpdatedAtRef.current = cloudUpdatedAt;
          writeSyncMeta({ lastSyncedAt: cloudUpdatedAt, dirty: false });
        }
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    [writeSyncMeta],
  );

  const pushNow = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    setStatus('saving');
    try {
      const { updatedAt } = await pushSave(u.id, latestRef.current);
      lastKnownCloudUpdatedAtRef.current = updatedAt;
      writeSyncMeta({ lastSyncedAt: updatedAt, dirty: false });
      setStatus('idle');
      retryAttemptRef.current = 0;
    } catch (_err) {
      const next = retryAttemptRef.current;
      if (next < RETRY_DELAYS_MS.length) {
        retryAttemptRef.current = next + 1;
        setStatus('saving');
        setTimeout(() => {
          pushNow();
        }, RETRY_DELAYS_MS[next]);
      } else {
        setStatus('offline');
        retryAttemptRef.current = 0;
      }
    }
  }, [writeSyncMeta]);

  const flushLocal = useCallback(() => {
    if (localTimeoutRef.current) {
      clearTimeout(localTimeoutRef.current);
      localTimeoutRef.current = null;
    }
    // PHASE-08 08C: the fingerprint + cross-tab broadcast now ride the local-save
    // debounce (see setState), so a flush that pre-empts that timer must still
    // record the settled hash (keep the self-echo dedup correct) and emit the
    // broadcast it would have sent.
    const settled = latestRef.current;
    trackLocalHash(settled);
    noteSaveResult(saveToLocalStorage(settled));
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: 'state', state: settled });
      } catch {
        /* channel may be closed */
      }
    }
  }, []);

  const flushCloud = useCallback(() => {
    if (cloudTimeoutRef.current) {
      clearTimeout(cloudTimeoutRef.current);
      cloudTimeoutRef.current = null;
      pushNow();
    }
  }, [pushNow]);

  const setState = useCallback(
    (next) => {
      setStateInternal((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        latestRef.current = resolved;

        // PHASE-08 08C: the full-blob fingerprint (trackLocalHash → JSON.stringify
        // over the whole state) and the cross-tab broadcast (a structured clone of
        // the whole ~90 KB blob via postMessage) used to run SYNCHRONOUSLY on every
        // setState. An answer event fires ~4 setStates in a burst, so that was ~4
        // stringifies + ~4 structured clones per click on the main thread. Move both
        // onto the trailing edge of the existing local-save debounce so they run
        // ONCE per settle. The self-echo dedup contract is preserved: only settled
        // states are ever broadcast or pushed, and trackLocalHash now records
        // exactly those — intermediate, never-emitted states are simply skipped.
        const broadcast = !applyingRemoteRef.current;

        if (localTimeoutRef.current) clearTimeout(localTimeoutRef.current);
        localTimeoutRef.current = setTimeout(() => {
          const settled = latestRef.current;
          trackLocalHash(settled);
          noteSaveResult(saveToLocalStorage(settled));
          // I1: keep a throttled rotating snapshot for local crash/reset recovery.
          writeSnapshot(settled);
          // Broadcast to other tabs in the same browser (signed-in or not — local
          // sync helps even guest users with multiple tabs open). Skipped while
          // applying a remote update so we never echo it back out.
          if (broadcast && broadcastChannelRef.current) {
            try {
              broadcastChannelRef.current.postMessage({ type: 'state', state: settled });
            } catch {
              /* channel may be closed */
            }
          }
          localTimeoutRef.current = null;
        }, LOCAL_DEBOUNCE_MS);

        // Cloud dirty-marking + debounced push stay per-setState — they touch only
        // the tiny sync-meta object, not the full blob. Skip when applying a remote
        // update (don't push back what we just received).
        if (!applyingRemoteRef.current && userRef.current) {
          const meta = loadSyncMeta();
          if (!meta.dirty) saveSyncMeta({ ...meta, dirty: true });

          if (cloudTimeoutRef.current) clearTimeout(cloudTimeoutRef.current);
          cloudTimeoutRef.current = setTimeout(() => {
            cloudTimeoutRef.current = null;
            pushNow();
          }, CLOUD_DEBOUNCE_MS);
        }

        return resolved;
      });
    },
    [pushNow],
  );

  // BroadcastChannel for cross-tab same-browser live updates.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return; // older browsers
    const channel = new BroadcastChannel(BROADCAST_CHANNEL);
    broadcastChannelRef.current = channel;
    channel.onmessage = (ev) => {
      if (ev.data?.type !== 'state') return;
      // BroadcastChannel structured-clones on send, so reference equality
      // against latestRef would never match — use the hash dedup instead.
      try {
        const incomingHash = JSON.stringify(ev.data.state);
        if (recentLocalHashesRef.current.includes(incomingHash)) return;
      } catch {
        /* fall through and apply */
      }
      applyRemoteState(ev.data.state, null);
    };
    return () => {
      try {
        channel.close();
      } catch {
        /* ignore */
      }
      if (broadcastChannelRef.current === channel) broadcastChannelRef.current = null;
    };
  }, [applyRemoteState]);

  // Flush listeners.
  useEffect(() => {
    const onUnload = () => {
      flushLocal();
      flushCloud();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushLocal();
        flushCloud();
      }
    };
    const onBlur = () => {
      flushLocal();
      flushCloud();
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      flushLocal();
    };
  }, [flushLocal, flushCloud]);

  // On sign-out: abort pending cloud write, clear sync meta, reset retry.
  useEffect(() => {
    if (!userId) {
      if (cloudTimeoutRef.current) {
        clearTimeout(cloudTimeoutRef.current);
        cloudTimeoutRef.current = null;
      }
      clearSyncMeta();
      setLastSyncedAt(null);
      lastKnownCloudUpdatedAtRef.current = null;
    }
    retryAttemptRef.current = 0;
  }, [userId]);

  // Sign-in / session-resume handler.
  useEffect(() => {
    if (!user) {
      setMergeRequired(false);
      setLocalPreview(null);
      setCloudPreview(null);
      return;
    }
    let active = true;

    (async () => {
      try {
        upsertProfile(user.id, user.githubLogin, user.avatarUrl).catch(() => {});

        const cloud = await pullSave(user.id);
        if (!active) return;

        const cloudData = cloud ? applyBackfills(migrateIfNeeded(cloud.data, cloud.schemaVer)) : null;
        const local = latestRef.current;
        const cloudHasData = cloudData && hasMeaningfulData(cloudData);
        const localHasData = hasMeaningfulData(local);

        if (!cloudHasData && !localHasData) return;
        if (cloudHasData && !localHasData) {
          applyRemoteState(cloudData, cloud.updatedAt);
          return;
        }
        if (!cloudHasData && localHasData) {
          const { updatedAt } = await pushSave(user.id, local);
          lastKnownCloudUpdatedAtRef.current = updatedAt;
          writeSyncMeta({ lastSyncedAt: updatedAt, dirty: false });
          return;
        }

        const meta = loadSyncMeta();
        const lastSync = meta.lastSyncedAt;
        const wasDirty = !!meta.dirty;

        // Identical-content guard: when local and cloud match on every
        // user-observable counter, suppress the MergeChooser branches that
        // would otherwise force an arbitrary pick. Phase 33a switched from
        // strict hashState (which captured internal noise like mistakeVault
        // timestamps from independent device backfills) to semanticHashState
        // (which fingerprints just level/XP/per-tome counters). This is the
        // right level for "did the user actually diverge?" — bit-exact equality
        // would falsely flag two devices that did the same things in slightly
        // different orders. Applied surgically to chooser paths only; the
        // dirty-push branch is intentionally untouched.
        const localCloudIdentical = semanticHashState(local) === semanticHashState(cloudData);

        if (!lastSync) {
          if (localCloudIdentical) {
            lastKnownCloudUpdatedAtRef.current = cloud.updatedAt;
            writeSyncMeta({ lastSyncedAt: cloud.updatedAt, dirty: false });
            return;
          }
          setLocalPreview(local);
          setCloudPreview(cloudData);
          setMergeRequired(true);
          return;
        }

        const cloudTime = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
        const lastSyncTime = new Date(lastSync).getTime();

        if (cloudTime <= lastSyncTime) {
          if (wasDirty) {
            const { updatedAt } = await pushSave(user.id, local);
            lastKnownCloudUpdatedAtRef.current = updatedAt;
            writeSyncMeta({ lastSyncedAt: updatedAt, dirty: false });
          } else {
            // We're already in sync. Track the cloud's updated_at for Realtime dedup.
            lastKnownCloudUpdatedAtRef.current = cloud.updatedAt;
          }
          return;
        }

        if (!wasDirty) {
          applyRemoteState(cloudData, cloud.updatedAt);
          return;
        }

        // dirty + cloud changed → would normally show the chooser. Suppress
        // when contents match: nothing to merge, just record the sync.
        if (localCloudIdentical) {
          lastKnownCloudUpdatedAtRef.current = cloud.updatedAt;
          writeSyncMeta({ lastSyncedAt: cloud.updatedAt, dirty: false });
          return;
        }

        setLocalPreview(local);
        setCloudPreview(cloudData);
        setMergeRequired(true);
      } catch (err) {
        logError('Cloud pull failed', err);
        setStatus('offline');
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, applyRemoteState, writeSyncMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription for cross-device live updates.
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeSaves(userId, (cloud) => {
      // Fast path: exact updatedAt match → known echo of our last push.
      if (cloud.updatedAt === lastKnownCloudUpdatedAtRef.current) return;
      // Robust path: any cloud snapshot whose content matches a state we
      // recently held locally is either our own push reflected back or a
      // stale Realtime delivery already overtaken by a newer local change.
      // Either way, applying it would revert work — skip.
      try {
        const cloudHash = JSON.stringify(cloud.data);
        if (recentLocalHashesRef.current.includes(cloudHash)) {
          lastKnownCloudUpdatedAtRef.current = cloud.updatedAt;
          return;
        }
      } catch {
        /* fall through and apply */
      }
      const cloudData = applyBackfills(migrateIfNeeded(cloud.data, cloud.schemaVer));
      applyRemoteState(cloudData, cloud.updatedAt);
    });
    return unsub;
  }, [userId, applyRemoteState]);

  const resolveMerge = useCallback(
    async (choice) => {
      if (!user) return;
      if (choice === 'cancel') {
        setMergeRequired(false);
        setLocalPreview(null);
        setCloudPreview(null);
        return;
      }
      if (choice === 'local') {
        try {
          const { updatedAt } = await pushSave(user.id, latestRef.current);
          lastKnownCloudUpdatedAtRef.current = updatedAt;
          writeSyncMeta({ lastSyncedAt: updatedAt, dirty: false });
        } catch (_err) {
          setStatus('offline');
        }
      } else if (choice === 'cloud' && cloudPreview) {
        applyRemoteState(cloudPreview, null);
        // We don't have the cloud's updated_at handy here, so do a quick pull
        // to sync our lastKnownCloudUpdatedAt + lastSyncedAt.
        try {
          const fresh = await pullSave(user.id);
          if (fresh) {
            lastKnownCloudUpdatedAtRef.current = fresh.updatedAt;
            writeSyncMeta({ lastSyncedAt: fresh.updatedAt, dirty: false });
          }
        } catch {
          /* ignore — local already replaced */
        }
      }
      setMergeRequired(false);
      setLocalPreview(null);
      setCloudPreview(null);
    },
    [user, cloudPreview, writeSyncMeta, applyRemoteState],
  );

  const sync = { mergeRequired, localPreview, cloudPreview, resolveMerge, status, lastSyncedAt, localSaveFailed };
  return [state, setState, sync];
}
