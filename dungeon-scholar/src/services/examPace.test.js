import { describe, it, expect } from 'vitest';
import { computeExamPace } from './examPace.js';

const ON = (y, m, d) => new Date(y, m - 1, d);

describe('computeExamPace', () => {
  it('returns null for falsy or malformed exam dates', () => {
    expect(computeExamPace(null, 100)).toBeNull();
    expect(computeExamPace(undefined, 100)).toBeNull();
    expect(computeExamPace('', 100)).toBeNull();
    expect(computeExamPace('not a date', 100)).toBeNull();
    expect(computeExamPace('2026/05/20', 100)).toBeNull();
    expect(computeExamPace('2026-13-01', 100)).toBeNull();
    expect(computeExamPace('2026-02-30', 100)).toBeNull();
  });

  it('marks past dates with status "past" and null dailyTarget', () => {
    const out = computeExamPace('2026-05-01', 120, ON(2026, 5, 10));
    expect(out.status).toBe('past');
    expect(out.daysRemaining).toBe(-9);
    expect(out.dailyTarget).toBeNull();
  });

  it('marks today with status "today" and recommends finishing today', () => {
    const out = computeExamPace('2026-05-10', 120, ON(2026, 5, 10));
    expect(out.status).toBe('today');
    expect(out.daysRemaining).toBe(0);
    expect(out.dailyTarget).toBe(120);
  });

  it('marks future dates with status "upcoming" and computes daily target including today as a study day', () => {
    // exam in 14 calendar days → 15 study days (today included) → 120/15 = 8
    const out = computeExamPace('2026-05-24', 120, ON(2026, 5, 10));
    expect(out.status).toBe('upcoming');
    expect(out.daysRemaining).toBe(14);
    expect(out.dailyTarget).toBe(8);
  });

  it('rounds the daily target up so the deck is finished in time', () => {
    // 119 items / 14 study days = 8.5 → ceil → 9
    const out = computeExamPace('2026-05-23', 119, ON(2026, 5, 10));
    expect(out.daysRemaining).toBe(13);
    expect(out.dailyTarget).toBe(9);
  });

  it('returns dailyTarget 0 when total items is 0', () => {
    const out = computeExamPace('2026-05-24', 0, ON(2026, 5, 10));
    expect(out.dailyTarget).toBe(0);
  });

  it('coerces totalItems to a non-negative integer', () => {
    expect(computeExamPace('2026-05-24', -5, ON(2026, 5, 10))?.dailyTarget).toBe(0);
    expect(computeExamPace('2026-05-24', 'lots', ON(2026, 5, 10))?.dailyTarget).toBe(0);
    expect(computeExamPace('2026-05-24', null, ON(2026, 5, 10))?.dailyTarget).toBe(0);
    expect(computeExamPace('2026-05-24', 12.7, ON(2026, 5, 10))?.dailyTarget).toBe(1); // floor 12 / 15 study days = 0.8 → ceil 1
  });

  it('treats exam-tomorrow as 2 study days', () => {
    const out = computeExamPace('2026-05-11', 100, ON(2026, 5, 10));
    expect(out.daysRemaining).toBe(1);
    // 100 / 2 = 50
    expect(out.dailyTarget).toBe(50);
  });

  it('handles year boundaries correctly (no timezone drift)', () => {
    const out = computeExamPace('2027-01-05', 100, ON(2026, 12, 31));
    expect(out.daysRemaining).toBe(5);
    // 100 / 6 = ~16.67 → ceil → 17
    expect(out.dailyTarget).toBe(17);
  });

  it('defaults to the current date when today is omitted', () => {
    // We can't assert exact daysRemaining without freezing time, but the
    // call should not throw and should return a sane object.
    const out = computeExamPace('2099-01-01', 100);
    expect(out).not.toBeNull();
    expect(out.status).toBe('upcoming');
    expect(out.daysRemaining).toBeGreaterThan(0);
    expect(out.dailyTarget).toBeGreaterThan(0);
  });
});
