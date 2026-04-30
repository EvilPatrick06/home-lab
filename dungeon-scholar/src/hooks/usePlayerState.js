import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  hasMeaningfulData,
  migrateIfNeeded,
  CURRENT_SCHEMA_VER,
  loadSyncMeta,
  saveSyncMeta,
  clearSyncMeta,
} from '../services/persistence.js';
import { pullSave, pushSave, upsertProfile } from '../services/cloudSync.js';

const LOCAL_DEBOUNCE_MS = 500;
const CLOUD_DEBOUNCE_MS = 3000;
const RETRY_DELAYS_MS = [1000, 4000, 16000];

/**
 * Combined local + cloud persistence hook.
 *
 * Sync behavior on sign-in (or session resume):
 *   - empty cloud + empty local                    → no-op
 *   - cloud has data + empty local                 → cloud wins silently
 *   - empty cloud + local has data                 → push local silently
 *   - both have data, never synced before          → CHOOSER (real first-time conflict)
 *   - both have data, cloud unchanged since sync   → push if local is dirty, else no-op
 *   - both have data, cloud changed, local clean   → cloud wins silently (another device updated)
 *   - both have data, cloud changed, local dirty   → CHOOSER (real concurrent conflict)
 *
 * @param defaultState  initial blob if nothing is stored anywhere
 * @param user          { id, githubLogin, avatarUrl } | null
 * @returns [state, setState, sync]
 *   sync = { mergeRequired, localPreview, cloudPreview, resolveMerge, status, lastSyncedAt }
 */
export function usePlayerState(defaultState, user = null) {
  const [state, setStateInternal] = useState(() => {
    const stored = loadFromLocalStorage();
    return stored ? migrateIfNeeded(stored, CURRENT_SCHEMA_VER) : defaultState;
  });

  const [mergeRequired, setMergeRequired] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);
  const [cloudPreview, setCloudPreview] = useState(null);
  const [status, setStatus] = useState('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => loadSyncMeta().lastSyncedAt);

  const latestRef = useRef(state);
  const localTimeoutRef = useRef(null);
  const cloudTimeoutRef = useRef(null);
  const retryAttemptRef = useRef(0);

  const userRef = useRef(user);
  // user?.id is stable across token-refresh re-projections, so use it (not the
  // user object reference) as the effect dep.
  const userId = user?.id ?? null;
  useEffect(() => { userRef.current = user; }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update sync meta in both ref-mirrored React state and localStorage.
  const writeSyncMeta = useCallback((meta) => {
    saveSyncMeta(meta);
    setLastSyncedAt(meta.lastSyncedAt);
  }, []);

  const pushNow = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    setStatus('saving');
    try {
      await pushSave(u.id, latestRef.current);
      // Cloud's updated_at is now() server-side; we approximate with client now.
      // Mismatches under a few seconds don't matter for our comparisons.
      const nowIso = new Date().toISOString();
      writeSyncMeta({ lastSyncedAt: nowIso, dirty: false });
      setStatus('idle');
      retryAttemptRef.current = 0;
    } catch (err) {
      const next = retryAttemptRef.current;
      if (next < RETRY_DELAYS_MS.length) {
        retryAttemptRef.current = next + 1;
        setStatus('saving');
        setTimeout(() => { pushNow(); }, RETRY_DELAYS_MS[next]);
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
    saveToLocalStorage(latestRef.current);
  }, []);

  // Flush any pending cloud push immediately. Used by tab-visibility / blur
  // handlers and beforeunload so changes don't sit in a debounce window when
  // the user switches browsers.
  const flushCloud = useCallback(() => {
    if (cloudTimeoutRef.current) {
      clearTimeout(cloudTimeoutRef.current);
      cloudTimeoutRef.current = null;
      pushNow();
    }
  }, [pushNow]);

  const setState = useCallback((next) => {
    setStateInternal((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      latestRef.current = resolved;

      if (localTimeoutRef.current) clearTimeout(localTimeoutRef.current);
      localTimeoutRef.current = setTimeout(() => {
        saveToLocalStorage(latestRef.current);
        localTimeoutRef.current = null;
      }, LOCAL_DEBOUNCE_MS);

      // Mark dirty so the next sign-in pull knows we have unpushed changes.
      if (userRef.current) {
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
  }, [pushNow]);

  // Flush listeners: tab close, tab hidden, window blur. Each is a moment
  // where pending writes could otherwise sit unpushed.
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
    }
    retryAttemptRef.current = 0;
  }, [userId]);

  // Sign-in / session-resume handler: pull cloud, decide branch using sync meta.
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
        // Best-effort profile upsert; ignore errors (profile is cosmetic).
        upsertProfile(user.id, user.githubLogin, user.avatarUrl).catch(() => {});

        const cloud = await pullSave(user.id);
        if (!active) return;

        const cloudData = cloud ? migrateIfNeeded(cloud.data, cloud.schemaVer) : null;
        const local = latestRef.current;
        const cloudHasData = cloudData && hasMeaningfulData(cloudData);
        const localHasData = hasMeaningfulData(local);

        if (!cloudHasData && !localHasData) return;
        if (cloudHasData && !localHasData) {
          // Cloud wins silently.
          latestRef.current = cloudData;
          setStateInternal(cloudData);
          saveToLocalStorage(cloudData);
          writeSyncMeta({ lastSyncedAt: cloud.updatedAt, dirty: false });
          return;
        }
        if (!cloudHasData && localHasData) {
          // Local wins silently — push to cloud.
          await pushSave(user.id, local);
          writeSyncMeta({ lastSyncedAt: new Date().toISOString(), dirty: false });
          return;
        }

        // Both sides have data. Use sync meta to decide.
        const meta = loadSyncMeta();
        const lastSync = meta.lastSyncedAt;
        const wasDirty = !!meta.dirty;

        if (!lastSync) {
          // Never synced this device with this account → real first-time conflict.
          setLocalPreview(local);
          setCloudPreview(cloudData);
          setMergeRequired(true);
          return;
        }

        const cloudTime = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
        const lastSyncTime = new Date(lastSync).getTime();

        if (cloudTime <= lastSyncTime) {
          // Cloud hasn't changed since we last synced. If local is dirty, push.
          if (wasDirty) {
            await pushSave(user.id, local);
            writeSyncMeta({ lastSyncedAt: new Date().toISOString(), dirty: false });
          }
          return;
        }

        // Cloud has changed since our last sync.
        if (!wasDirty) {
          // We have no unsaved changes → another device updated; take cloud silently.
          latestRef.current = cloudData;
          setStateInternal(cloudData);
          saveToLocalStorage(cloudData);
          writeSyncMeta({ lastSyncedAt: cloud.updatedAt, dirty: false });
          return;
        }

        // Cloud changed AND we have unsaved local edits → real conflict.
        setLocalPreview(local);
        setCloudPreview(cloudData);
        setMergeRequired(true);
      } catch (err) {
        console.error('Cloud pull failed:', err);
        setStatus('offline');
      }
    })();

    return () => { active = false; };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveMerge = useCallback(async (choice) => {
    if (!user) return;
    if (choice === 'cancel') {
      setMergeRequired(false);
      setLocalPreview(null);
      setCloudPreview(null);
      return;
    }
    if (choice === 'local') {
      try {
        await pushSave(user.id, latestRef.current);
        writeSyncMeta({ lastSyncedAt: new Date().toISOString(), dirty: false });
      } catch (err) {
        setStatus('offline');
      }
    } else if (choice === 'cloud' && cloudPreview) {
      latestRef.current = cloudPreview;
      setStateInternal(cloudPreview);
      saveToLocalStorage(cloudPreview);
      // Use the cloud blob's timestamp if we still have it; otherwise now.
      writeSyncMeta({ lastSyncedAt: new Date().toISOString(), dirty: false });
    }
    setMergeRequired(false);
    setLocalPreview(null);
    setCloudPreview(null);
  }, [user, cloudPreview, writeSyncMeta]);

  const sync = { mergeRequired, localPreview, cloudPreview, resolveMerge, status, lastSyncedAt };
  return [state, setState, sync];
}
