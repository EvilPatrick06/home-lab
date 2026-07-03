import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatHash, parseHash, SCREENS, useHashRoute } from './useHashRoute.js';

function setHash(h) {
  window.location.hash = h;
}
function fireHashChange() {
  window.dispatchEvent(new Event('hashchange'));
}

beforeEach(() => {
  // Reset to a clean, hash-less URL before each test.
  window.history.replaceState(null, '', '/');
});

describe('parseHash (PHASE-39 39G)', () => {
  it('treats empty / bare-hash forms as home', () => {
    for (const h of ['', '#', '#/']) expect(parseHash(h)).toEqual({ screen: 'home', tomeId: null });
  });

  it('parses every valid screen', () => {
    for (const s of SCREENS) expect(parseHash(`#/${s}`)).toEqual({ screen: s, tomeId: null });
  });

  it('parses tome deep links (bare + with screen + percent-encoded id)', () => {
    expect(parseHash('#/tome/abc')).toEqual({ screen: 'home', tomeId: 'abc' });
    expect(parseHash('#/tome/abc/shop')).toEqual({ screen: 'shop', tomeId: 'abc' });
    expect(parseHash('#/tome/tome_a%20b')).toEqual({ screen: 'home', tomeId: 'tome_a b' });
    // unknown trailing screen falls back to home, tome still captured
    expect(parseHash('#/tome/abc/bogus')).toEqual({ screen: 'home', tomeId: 'abc' });
  });

  it('returns null screen for junk / unknown names', () => {
    expect(parseHash('#/bogus')).toEqual({ screen: null, tomeId: null });
    expect(parseHash('#/tome/')).toEqual({ screen: null, tomeId: null });
  });
});

describe('formatHash (PHASE-39 39G)', () => {
  it('prefixes #/', () => {
    expect(formatHash('shop')).toBe('#/shop');
    expect(formatHash('home')).toBe('#/home');
  });
});

describe('useHashRoute (PHASE-39 39G)', () => {
  it('seeds from computeInitialScreen on an empty hash and canonicalizes the URL', () => {
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    expect(result.current[0]).toBe('home');
    expect(window.location.hash).toBe('#/home');
  });

  it('a valid preset hash wins over computeInitialScreen', () => {
    setHash('#/shop');
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    expect(result.current[0]).toBe('shop');
  });

  it('a live exam (computeInitialScreen → practiceExam) overrides the hash', () => {
    setHash('#/shop');
    const { result } = renderHook(() => useHashRoute(() => 'practiceExam'));
    expect(result.current[0]).toBe('practiceExam');
  });

  it('setScreen updates the hash and the screen', () => {
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    act(() => {
      result.current[1]('quiz');
      fireHashChange();
    });
    expect(window.location.hash).toBe('#/quiz');
    expect(result.current[0]).toBe('quiz');
  });

  it('follows Back/Forward (a hashchange to a valid screen)', () => {
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    act(() => {
      setHash('#/library');
      fireHashChange();
    });
    expect(result.current[0]).toBe('library');
  });

  it('bounces an invalid hash to home', () => {
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    act(() => {
      setHash('#/bogus');
      fireHashChange();
    });
    expect(result.current[0]).toBe('home');
    expect(window.location.hash).toBe('#/home');
  });

  it('exposes a pending tome id for a #/tome/<id> deep link', () => {
    setHash('#/tome/abc');
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    expect(result.current[2]).toBe('abc');
    act(() => {
      result.current[3](); // clearPendingTome
    });
    expect(result.current[2]).toBeNull();
    expect(window.location.hash).toBe('#/home');
  });
});

describe('useHashRoute runtime canonicalization (PHASE-11 F1)', () => {
  it('rewrites a runtime bare #/ to #/home', () => {
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    act(() => {
      setHash('#/');
      fireHashChange();
    });
    expect(result.current[0]).toBe('home');
    expect(window.location.hash).toBe('#/home');
  });

  it('leaves a #/tome/<id>/<screen> deep link uncanonicalized (tome consumed later)', () => {
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    act(() => {
      setHash('#/tome/abc/shop');
      fireHashChange();
    });
    expect(result.current[0]).toBe('shop');
    expect(result.current[2]).toBe('abc');
    expect(window.location.hash).toBe('#/tome/abc/shop');
  });

  it('does not clobber an already-canonical screen hash', () => {
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    act(() => {
      setHash('#/shop');
      fireHashChange();
    });
    expect(result.current[0]).toBe('shop');
    expect(window.location.hash).toBe('#/shop');
  });
});

describe('clearPendingTome explicit target (PHASE-13 F1)', () => {
  it('canonicalizes to the explicit target regardless of the current screen', () => {
    // Cold bad-id deep link: screen settles on the gated screen ('shop' here),
    // screenRef holds it. 08A's reset passes 'home' explicitly so the
    // synchronous replaceState cannot rewrite the URL back to the gated screen.
    setHash('#/tome/bad-id/shop');
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    expect(result.current[0]).toBe('shop');
    expect(result.current[2]).toBe('bad-id');
    act(() => {
      result.current[3]('home'); // clearPendingTome('home')
    });
    expect(result.current[2]).toBeNull();
    expect(window.location.hash).toBe('#/home');
  });

  it('no-arg default still canonicalizes off the current screen (valid deep-link path)', () => {
    setHash('#/tome/abc/shop');
    const { result } = renderHook(() => useHashRoute(() => 'home'));
    expect(result.current[0]).toBe('shop');
    expect(result.current[2]).toBe('abc');
    act(() => {
      result.current[3](); // clearPendingTome() — consume the tome, keep the screen
    });
    expect(result.current[2]).toBeNull();
    expect(window.location.hash).toBe('#/shop');
  });
});
