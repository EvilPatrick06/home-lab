// PHASE-39 39G — hash-based routing. Replaces the old `useState('home')` screen
// enum so the browser Back button navigates inside the app, refreshes keep their
// screen, and tomes are deep-linkable (`#/tome/<id>`). Hash fragments are never
// sent to the server, so this works on GitHub Pages under any base path with no
// `404.html`. Zero new dependencies.
import { useCallback, useEffect, useRef, useState } from 'react';

// Screen list now lives in the shared registry; re-exported here so existing
// importers (and useHashRoute.test.jsx) keep their `from './useHashRoute.js'` path.
import { SCREENS } from './screens.js';

export { SCREENS };

const SCREEN_SET = new Set(SCREENS);

// Pure. '#/shop' → { screen:'shop', tomeId:null }; '#/tome/abc' → { screen:'home', tomeId:'abc' };
// '#/tome/abc/shop' → { screen:'shop', tomeId:'abc' }; '' / '#' / '#/' → { screen:'home', tomeId:null };
// anything unrecognized → { screen:null, tomeId:null }.
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  if (raw === '') return { screen: 'home', tomeId: null };
  const parts = raw.split('/');
  if (parts[0] === 'tome') {
    const tomeId = parts[1] ? decodeURIComponent(parts[1]) : null;
    if (!tomeId) return { screen: null, tomeId: null };
    const screen = parts[2] && SCREEN_SET.has(parts[2]) ? parts[2] : 'home';
    return { screen, tomeId };
  }
  if (SCREEN_SET.has(parts[0])) return { screen: parts[0], tomeId: null };
  return { screen: null, tomeId: null };
}

export function formatHash(screen) {
  return `#/${screen}`;
}

// Returns [screen, setScreen, pendingTomeId, clearPendingTome]. `setScreen(name)`
// keeps the exact shape the old useState tuple had, so the ~36 call sites and the
// screen-keyed effects are untouched.
export function useHashRoute(computeInitialScreen) {
  // Lazy, pure init computed once. Exam precedence wins over any hash (preserves
  // today's reload-resumes-an-unexpired-Trial-of-Hours behavior); otherwise a
  // valid hash wins (deep-link / refresh-keeps-screen); otherwise the resume logic.
  const initRef = useRef(null);
  if (initRef.current === null) {
    const initial = computeInitialScreen();
    if (initial === 'practiceExam') {
      initRef.current = { screen: 'practiceExam', tomeId: null };
    } else {
      const parsed = parseHash(typeof window !== 'undefined' ? window.location.hash : '');
      initRef.current = parsed.screen
        ? { screen: parsed.screen, tomeId: parsed.tomeId }
        : { screen: initial, tomeId: null };
    }
  }

  const [screen, setScreenState] = useState(initRef.current.screen);
  const [pendingTomeId, setPendingTomeId] = useState(initRef.current.tomeId);

  // Mirror the current screen in a ref so setScreen/clearPendingTome read it
  // without a stale closure (and without re-creating their callbacks).
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  // Canonicalize the URL once on mount when there's no tome to consume. With a
  // pending tome the URL is canonicalized later by clearPendingTome (after the
  // tome is switched). `replace` (not push) so Back from the landing screen leaves
  // the site instead of cycling through a phantom entry.
  useEffect(() => {
    if (initRef.current.tomeId) return;
    const want = formatHash(initRef.current.screen);
    if (typeof window !== 'undefined' && window.location.hash !== want) {
      window.history.replaceState(null, '', want);
    }
  }, []);

  // Back/Forward + programmatic `location.hash = …` both fire hashchange → single sync path.
  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHash(window.location.hash);
      if (parsed.screen) {
        setScreenState(parsed.screen);
        if (parsed.tomeId) setPendingTomeId(parsed.tomeId);
      } else {
        window.history.replaceState(null, '', formatHash('home'));
        setScreenState('home');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setScreen = useCallback((name) => {
    if (name === screenRef.current) return; // no-op: setting the same hash fires no hashchange
    window.location.hash = formatHash(name); // pushes a history entry + fires hashchange (syncs state)
  }, []);

  const clearPendingTome = useCallback(() => {
    setPendingTomeId(null);
    // Drop the consumed tome segment: #/tome/<id>/<screen> → #/<screen>.
    window.history.replaceState(null, '', formatHash(screenRef.current));
  }, []);

  return [screen, setScreen, pendingTomeId, clearPendingTome];
}
