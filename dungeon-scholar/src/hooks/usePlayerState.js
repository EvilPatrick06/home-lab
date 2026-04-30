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

      return resolved;
    });
  }, []);

  // beforeunload flush
  useEffect(() => {
    const onUnload = () => flushLocal();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      flushLocal();
    };
  }, [flushLocal]);

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
  }, [user]);

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
