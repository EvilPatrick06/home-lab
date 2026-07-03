import { describe, expect, it } from 'vitest';
import {
  addReport,
  makeReport,
  openReportCount,
  reasonLabel,
  removeReport,
  REPORT_NOTE_MAX,
  resolveReport,
} from './reportProblem.js';

describe('makeReport', () => {
  it('returns null without an itemId', () => {
    expect(makeReport({})).toBe(null);
    expect(makeReport({ itemId: '' })).toBe(null);
  });

  it('normalizes reason, type, and note', () => {
    const r = makeReport({ itemId: 'q1', itemType: 'weird', reason: 'bogus', note: '  x  ', now: 100 });
    expect(r).toMatchObject({ itemId: 'q1', itemType: 'quiz', reason: 'other', note: 'x', resolved: false });
    expect(r.id).toMatch(/^rpt_100_/);
  });

  it('caps the note length', () => {
    const r = makeReport({ itemId: 'q1', note: 'a'.repeat(1000) });
    expect(r.note.length).toBe(REPORT_NOTE_MAX);
  });

  it('keeps a valid reason + flashcard type', () => {
    const r = makeReport({ itemId: 'c1', itemType: 'flashcard', reason: 'typo' });
    expect(r.itemType).toBe('flashcard');
    expect(r.reason).toBe('typo');
  });
});

describe('addReport / dedupe', () => {
  it('appends a new report', () => {
    const r = makeReport({ itemId: 'q1', reason: 'typo', now: 1 });
    const list = addReport([], r);
    expect(list).toHaveLength(1);
  });

  it('dedupes by (itemId, reason) for open reports, updating note', () => {
    const a = makeReport({ itemId: 'q1', reason: 'typo', note: 'first', now: 1 });
    const b = makeReport({ itemId: 'q1', reason: 'typo', note: 'second', now: 2 });
    let list = addReport([], a);
    list = addReport(list, b);
    expect(list).toHaveLength(1);
    expect(list[0].note).toBe('second');
    expect(list[0].reportedAt).toBe(2);
  });

  it('keeps distinct reasons on the same item separate', () => {
    let list = addReport([], makeReport({ itemId: 'q1', reason: 'typo', now: 1 }));
    list = addReport(list, makeReport({ itemId: 'q1', reason: 'wrong-answer', now: 2 }));
    expect(list).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const orig = [];
    addReport(orig, makeReport({ itemId: 'q1', now: 1 }));
    expect(orig).toHaveLength(0);
  });
});

describe('resolve / remove / count', () => {
  it('resolves and counts open reports', () => {
    let list = addReport([], makeReport({ itemId: 'q1', reason: 'typo', now: 1 }));
    list = addReport(list, makeReport({ itemId: 'q2', reason: 'typo', now: 2 }));
    expect(openReportCount(list)).toBe(2);
    const id = list[0].id;
    list = resolveReport(list, id);
    expect(openReportCount(list)).toBe(1);
    list = removeReport(list, list[1].id);
    expect(list).toHaveLength(1);
  });

  it('reasonLabel maps known + unknown reasons', () => {
    expect(reasonLabel('wrong-answer')).toMatch(/answer/i);
    expect(reasonLabel('nope')).toBe('Other');
  });
});
