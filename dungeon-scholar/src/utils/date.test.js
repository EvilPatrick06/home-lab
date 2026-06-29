import { describe, expect, it } from 'vitest';
import { formatDateLabel, formatDateTimeLabel, formatYmd, todayDateStr } from './date.js';

describe('utils/date', () => {
  it('formatYmd zero-pads month and day', () => {
    expect(formatYmd(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatYmd(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  it('todayDateStr matches YYYY-MM-DD', () => {
    expect(todayDateStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('utils/date — formatDateLabel (user-facing ISO calendar date)', () => {
  it('formats a Date as locale-independent YYYY-MM-DD', () => {
    expect(formatDateLabel(new Date(2026, 5, 28))).toBe('2026-06-28');
    expect(formatDateLabel(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('accepts an epoch-millis number', () => {
    expect(formatDateLabel(new Date(2026, 5, 28, 13, 30).getTime())).toBe('2026-06-28');
  });
  it('returns the default fallback for missing/invalid input', () => {
    expect(formatDateLabel(null)).toBe('—');
    expect(formatDateLabel(undefined)).toBe('—');
    expect(formatDateLabel('not-a-date')).toBe('—');
  });
  it('honors a custom fallback (e.g. null for hide-when-absent)', () => {
    expect(formatDateLabel(undefined, null)).toBe(null);
    expect(formatDateLabel(null, null)).toBe(null);
  });
});

describe('utils/date — formatDateTimeLabel (user-facing ISO date + 24h time)', () => {
  it('formats a Date as YYYY-MM-DD · HH:MM with zero-padding', () => {
    expect(formatDateTimeLabel(new Date(2026, 5, 28, 9, 5))).toBe('2026-06-28 · 09:05');
    expect(formatDateTimeLabel(new Date(2026, 5, 28, 14, 14))).toBe('2026-06-28 · 14:14');
  });
  it('returns the default fallback for missing/invalid input', () => {
    expect(formatDateTimeLabel(null)).toBe('—');
    expect(formatDateTimeLabel('not-a-date')).toBe('—');
  });
  it('honors a custom fallback', () => {
    expect(formatDateTimeLabel(undefined, null)).toBe(null);
  });
});
