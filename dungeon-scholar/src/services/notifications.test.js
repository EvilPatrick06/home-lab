import { describe, it, expect } from 'vitest';
import { buildReminderText, notificationsSupported, showStudyReminder } from './notifications.js';

describe('notifications (S1)', () => {
  it('prioritizes due cards in the reminder text', () => {
    expect(buildReminderText({ dueCount: 3 })).toContain('3 scrolls');
    expect(buildReminderText({ dueCount: 1 })).toContain('1 scroll await');
  });
  it('falls back to streak-at-risk, else null', () => {
    expect(buildReminderText({ dueCount: 0, streakAtRisk: true })).toContain('streak');
    expect(buildReminderText({ dueCount: 0, streakAtRisk: false })).toBeNull();
    expect(buildReminderText()).toBeNull();
  });
  it('showStudyReminder is a no-op without granted permission', () => {
    if (!notificationsSupported() || Notification.permission !== 'granted') {
      expect(showStudyReminder({ dueCount: 5 })).toBe(false);
    }
  });
});
