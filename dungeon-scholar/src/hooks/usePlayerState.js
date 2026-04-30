import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadFromLocalStorage,
  saveToLocalStorage,
  migrateIfNeeded,
  CURRENT_SCHEMA_VER,
} from '../services/persistence.js';

const LOCAL_DEBOUNCE_MS = 500;

export function usePlayerState(defaultState) {
  // Hydrate synchronously so React's first paint already has the saved state.
  // migrateIfNeeded is a no-op for v1 but the call site is established for
  // future schema versions.
  const [state, setStateInternal] = useState(() => {
    const stored = loadFromLocalStorage();
    return stored ? migrateIfNeeded(stored, CURRENT_SCHEMA_VER) : defaultState;
  });

  // Track latest state for the debounced flusher and beforeunload handler.
  const latestRef = useRef(state);
  const timeoutRef = useRef(null);

  const flushLocal = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    saveToLocalStorage(latestRef.current);
  }, []);

  const setState = useCallback((next) => {
    setStateInternal((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      latestRef.current = resolved;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        saveToLocalStorage(latestRef.current);
        timeoutRef.current = null;
      }, LOCAL_DEBOUNCE_MS);

      return resolved;
    });
  }, []);

  // Flush on tab close.
  useEffect(() => {
    const onUnload = () => flushLocal();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      flushLocal();
    };
  }, [flushLocal]);

  return [state, setState];
}
