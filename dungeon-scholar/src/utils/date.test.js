import { describe, it, expect } from 'vitest';
import { formatYmd, todayDateStr } from './date.js';

describe('utils/date', () => {
  it('formatYmd zero-pads month and day', () => {
    expect(formatYmd(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatYmd(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  it('todayDateStr matches YYYY-MM-DD', () => {
    expect(todayDateStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
