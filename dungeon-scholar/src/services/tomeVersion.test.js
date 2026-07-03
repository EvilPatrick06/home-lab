import { describe, expect, it } from 'vitest';
import { bumpRevision, compareTomeVersions, importDecision, tomeRevision } from './tomeVersion.js';

describe('tomeRevision', () => {
  it('defaults absent/invalid to 0', () => {
    expect(tomeRevision({ data: { metadata: {} } })).toBe(0);
    expect(tomeRevision({ metadata: {} })).toBe(0);
    expect(tomeRevision(null)).toBe(0);
    expect(tomeRevision({ data: { metadata: { revision: 'x' } } })).toBe(0);
  });
  it('reads a numeric revision from a library entry or raw data', () => {
    expect(tomeRevision({ data: { metadata: { revision: 3 } } })).toBe(3);
    expect(tomeRevision({ metadata: { revision: 5 } })).toBe(5);
  });
});

describe('bumpRevision', () => {
  it('increments revision and stamps updatedAt', () => {
    const out = bumpRevision({ metadata: { title: 'T' } }, 1000);
    expect(out.metadata.revision).toBe(1);
    expect(out.metadata.updatedAt).toBe(1000);
    expect(out.metadata.title).toBe('T');
  });
  it('increments an existing revision', () => {
    expect(bumpRevision({ metadata: { revision: 4 } }).metadata.revision).toBe(5);
  });
});

describe('compareTomeVersions', () => {
  it('flags newer/same/older', () => {
    const inc = { metadata: { revision: 2 } };
    expect(compareTomeVersions(inc, { metadata: { revision: 1 } })).toMatchObject({ newer: true, same: false });
    expect(compareTomeVersions(inc, { metadata: { revision: 2 } })).toMatchObject({ same: true, newer: false });
    expect(compareTomeVersions(inc, { metadata: { revision: 3 } })).toMatchObject({ older: true });
  });
});

describe('importDecision', () => {
  const lib = [{ id: 't1', data: { id: 't1', metadata: { revision: 1 } }, progress: { cardsReviewed: 9 } }];
  it('returns new when no local copy exists', () => {
    const d = importDecision({ id: 't9', data: { id: 't9', metadata: {} } }, lib);
    expect(d.action).toBe('new');
    expect(d.local).toBe(null);
  });
  it('returns update when the incoming revision is newer', () => {
    const d = importDecision({ id: 't1', data: { id: 't1', metadata: { revision: 2 } } }, lib);
    expect(d.action).toBe('update');
    expect(d.local.progress.cardsReviewed).toBe(9);
    expect(d.incomingRevision).toBe(2);
  });
  it('returns up-to-date when same or older', () => {
    expect(importDecision({ id: 't1', data: { id: 't1', metadata: { revision: 1 } } }, lib).action).toBe('up-to-date');
    expect(importDecision({ id: 't1', data: { id: 't1', metadata: { revision: 0 } } }, lib).action).toBe('up-to-date');
  });
});
