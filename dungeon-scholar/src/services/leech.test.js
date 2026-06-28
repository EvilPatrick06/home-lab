import { describe, expect, it } from 'vitest';
import { isLeech, LEECH_LAPSE_THRESHOLD, leechCount, listLeeches } from './leech.js';

const card = (lapses, extra = {}) => ({ stability: 1, difficulty: 5, reps: 5, lapses, ...extra });

describe('LEECH_LAPSE_THRESHOLD', () => {
  it('defaults to 8 (Anki convention)', () => {
    expect(LEECH_LAPSE_THRESHOLD).toBe(8);
  });
});

describe('isLeech', () => {
  it('flags a card at or above the threshold', () => {
    expect(isLeech(card(8))).toBe(true);
    expect(isLeech(card(12))).toBe(true);
  });
  it('does not flag a card below the threshold', () => {
    expect(isLeech(card(7))).toBe(false);
    expect(isLeech(card(0))).toBe(false);
  });
  it('honors a custom threshold', () => {
    expect(isLeech(card(4), 4)).toBe(true);
    expect(isLeech(card(3), 4)).toBe(false);
  });
  it('is defensive about missing / malformed state', () => {
    expect(isLeech(null)).toBe(false);
    expect(isLeech(undefined)).toBe(false);
    expect(isLeech({})).toBe(false);
    expect(isLeech({ lapses: 'nope' })).toBe(false);
  });
});

describe('leechCount', () => {
  it('counts only cards at/above the threshold', () => {
    const map = { a: card(8), b: card(2), c: card(9), d: card(7) };
    expect(leechCount(map)).toBe(2);
  });
  it('returns 0 for an empty / invalid map', () => {
    expect(leechCount({})).toBe(0);
    expect(leechCount(null)).toBe(0);
  });
});

describe('listLeeches', () => {
  it('returns leeches worst-first', () => {
    const map = { a: card(8), b: card(12), c: card(3), d: card(9) };
    const out = listLeeches(map);
    expect(out.map((l) => l.id)).toEqual(['b', 'd', 'a']);
    expect(out[0]).toMatchObject({ id: 'b', lapses: 12, suspended: false });
  });
  it('attaches card content when the flashcards list is provided', () => {
    const map = { q1: card(10) };
    const cards = [{ id: 'q1', front: 'F', back: 'B', domain: 'Networking' }];
    const [leech] = listLeeches(map, cards);
    expect(leech).toMatchObject({ front: 'F', back: 'B', domain: 'Networking' });
  });
  it('keeps orphaned progress entries (no matching card) with null content', () => {
    const [leech] = listLeeches({ gone: card(10) }, [{ id: 'other', front: 'x' }]);
    expect(leech).toMatchObject({ id: 'gone', front: null, domain: null });
  });
  it('surfaces the suspended flag', () => {
    const [leech] = listLeeches({ s: card(10, { suspended: true }) });
    expect(leech.suspended).toBe(true);
  });
  it('breaks lapse ties by id for stable ordering', () => {
    const out = listLeeches({ z: card(8), a: card(8) });
    expect(out.map((l) => l.id)).toEqual(['a', 'z']);
  });
});
