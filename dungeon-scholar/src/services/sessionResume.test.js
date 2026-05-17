import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveSession,
  loadSession,
  clearSession,
  clearAllSessions,
  SESSION_KIND,
} from './sessionResume.js';

describe('sessionResume', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a quiz session', () => {
    saveSession(SESSION_KIND.QUIZ, { tomeId: 't1', index: 3, total: 95 });
    const restored = loadSession(SESSION_KIND.QUIZ);
    expect(restored).toMatchObject({ tomeId: 't1', index: 3, total: 95 });
  });

  it('round-trips an exam session including deadlineMs and answers', () => {
    saveSession(SESSION_KIND.EXAM, {
      tomeId: 't1',
      deadlineMs: Date.now() + 60_000,
      answers: [0, null, 2],
      currentIdx: 1,
    });
    const r = loadSession(SESSION_KIND.EXAM);
    expect(r.tomeId).toBe('t1');
    expect(r.answers).toEqual([0, null, 2]);
    expect(r.currentIdx).toBe(1);
    expect(typeof r.deadlineMs).toBe('number');
  });

  it('returns null when no session exists', () => {
    expect(loadSession(SESSION_KIND.QUIZ)).toBeNull();
    expect(loadSession(SESSION_KIND.EXAM)).toBeNull();
  });

  it('saveSession stamps savedAt for debugging', () => {
    const before = Date.now();
    saveSession(SESSION_KIND.FLASHCARDS, { tomeId: 't2', index: 5 });
    const r = loadSession(SESSION_KIND.FLASHCARDS);
    expect(r.savedAt).toBeGreaterThanOrEqual(before);
  });

  it('clearSession removes only the named kind', () => {
    saveSession(SESSION_KIND.QUIZ, { x: 1 });
    saveSession(SESSION_KIND.FLASHCARDS, { y: 2 });
    clearSession(SESSION_KIND.QUIZ);
    expect(loadSession(SESSION_KIND.QUIZ)).toBeNull();
    expect(loadSession(SESSION_KIND.FLASHCARDS)).toMatchObject({ y: 2 });
  });

  it('clearAllSessions removes every kind', () => {
    saveSession(SESSION_KIND.QUIZ, { a: 1 });
    saveSession(SESSION_KIND.FLASHCARDS, { b: 2 });
    saveSession(SESSION_KIND.EXAM, { c: 3 });
    clearAllSessions();
    Object.values(SESSION_KIND).forEach(k => {
      expect(loadSession(k)).toBeNull();
    });
  });

  it('survives malformed JSON in storage by returning null', () => {
    localStorage.setItem('ds:session:quiz', 'not json');
    expect(loadSession(SESSION_KIND.QUIZ)).toBeNull();
  });

  it('ignores save calls with unknown kinds', () => {
    saveSession('bogus', { x: 1 });
    expect(loadSession('bogus')).toBeNull();
  });
});
