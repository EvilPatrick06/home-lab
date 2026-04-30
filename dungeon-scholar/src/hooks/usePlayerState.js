import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  hasMeaningfulData,
  migrateIfNeeded,
  CURRENT_SCHEMA_VER,
} from '../services/persistence.js';
import { pullSave, pushSave, upsertProfile } from '../services/cloudSync.js';

const LOCAL_DEBOUNCE_MS = 500;
const CLOUD_DEBOUNCE_MS = 3000;
const RETRY_DELAYS_MS = [1000, 4000, 16000];

/**
 * Combined local + cloud persistence hook.
 *
 * @param defaultState  initial blob if nothing is stored anywhere
 * @param user          { id, githubLogin, avatarUrl } | null
 * @returns [state, setState, sync]
 *   sync = {
 *     mergeRequired: boolean,
 *     localPreview, cloudPreview,    // previews while merge pending
 *     resolveMerge: ('local' | 'cloud' | 'cancel') => void,
 *     status: 'idle' | 'saving' | 'error' | 'offline',
 *   }
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

  const latestRef = useRef(state);
  const localTimeoutRef = useRef(null);
  const cloudTimeoutRef = useRef(null);
  const retryAttemptRef = useRef(0);
  const userRef = useRef(user);
  // Use user?.id (not the user object) so we don't react to token-refresh
  // re-projections (Supabase emits TOKEN_REFRESHED → useAuth produces a new
  // user object with the same id; we don't want that to count as a sign-in).
  const userId = user?.id ?? null;
  useEffect(() => { userRef.current = user; }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushNow = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    setStatus('saving');
    try {
      await pushSave(u.id, latestRef.current);
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
  }, []);

  const flushLocal = useCallback(() => {
    if (localTimeoutRef.current) {
      clearTimeout(localTimeoutRef.current);
      localTimeoutRef.current = null;
    }
    saveToLocalStorage(latestRef.current);
  }, []);

  const setState = useCallback((next) => {
    setStateInternal((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      latestRef.current = resolved;

      if (localTimeoutRef.current) clearTimeout(localTimeoutRef.current);
      localTimeoutRef.current = setTimeout(() => {
        saveToLocalStorage(latestRef.current);
        localTimeoutRef.current = null;
      }, LOCAL_DEBOUNCE_MS);

      // Schedule cloud write only when signed in.
      if (userRef.current) {
        if (cloudTimeoutRef.current) clearTimeout(cloudTimeoutRef.current);
        cloudTimeoutRef.current = setTimeout(() => {
          cloudTimeoutRef.current = null;
          pushNow();
        }, CLOUD_DEBOUNCE_MS);
      }

      return resolved;
    });
  }, [pushNow]);

  // beforeunload flush — flush both local and pending cloud
  useEffect(() => {
    const onUnload = () => {
      flushLocal();
      if (cloudTimeoutRef.current) {
        clearTimeout(cloudTimeoutRef.current);
        cloudTimeoutRef.current = null;
        pushNow();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      flushLocal();
    };
  }, [flushLocal, pushNow]);

  // On sign-out: abort pending cloud write and reset retry state.
  useEffect(() => {
    if (!userId && cloudTimeoutRef.current) {
      clearTimeout(cloudTimeoutRef.current);
      cloudTimeoutRef.current = null;
    }
    retryAttemptRef.current = 0;
  }, [userId]);

  // Sign-in handler: pull cloud, decide branch.
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

        // Migrate cloud data to current shape at pull time. v1 is a no-op,
        // but future versions will normalize old rows here so downstream
        // code only has to handle one shape.
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
          return;
        }
        if (!cloudHasData && localHasData) {
          // Local wins silently — push to cloud.
          await pushSave(user.id, local);
          return;
        }
        // Both have data — surface the chooser.
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
      try { await pushSave(user.id, latestRef.current); } catch (err) { setStatus('offline'); }
    } else if (choice === 'cloud' && cloudPreview) {
      // cloudPreview is already migrated to the current shape (done at pull time).
      latestRef.current = cloudPreview;
      setStateInternal(cloudPreview);
      saveToLocalStorage(cloudPreview);
    }
    setMergeRequired(false);
    setLocalPreview(null);
    setCloudPreview(null);
  }, [user, cloudPreview]);

  const sync = { mergeRequired, localPreview, cloudPreview, resolveMerge, status };
  return [state, setState, sync];
}
