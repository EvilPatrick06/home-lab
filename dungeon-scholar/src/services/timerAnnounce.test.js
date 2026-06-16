import { describe, it, expect } from 'vitest';
import { timerAnnouncement } from './timerAnnounce.js';

describe('timerAnnouncement (PHASE-19 19D)', () => {
  it('announces when crossing each threshold', () => {
    expect(timerAnnouncement(1801, 1800)).toMatch(/30 minutes/);
    expect(timerAnnouncement(601, 600)).toMatch(/10 minutes/);
    expect(timerAnnouncement(301, 300)).toMatch(/5 minutes/);
    expect(timerAnnouncement(61, 60)).toMatch(/1 minute remains/);
  });

  it('returns null on a non-crossing tick', () => {
    expect(timerAnnouncement(1000, 999)).toBeNull();
    expect(timerAnnouncement(1801, 1799)).not.toBeNull(); // crosses 1800 — sanity for the next case
    expect(timerAnnouncement(1799, 1798)).toBeNull();
  });

  it('returns the deepest crossed message when a resume skips several thresholds', () => {
    expect(timerAnnouncement(700, 250)).toMatch(/5 minutes/); // crosses 600 and 300 → deepest = 300
  });

  it('returns null when the value does not change', () => {
    expect(timerAnnouncement(300, 300)).toBeNull();
  });
});
