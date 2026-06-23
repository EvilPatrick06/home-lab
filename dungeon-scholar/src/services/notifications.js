// S1: opt-in local study reminders via the Web Notifications API. Fully local
// (no push server); degrades silently where the API/permission is unavailable.
export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export async function requestStudyReminders() {
  if (!notificationsSupported()) return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

// Pure: the reminder body, or null when there is nothing worth nudging about.
export function buildReminderText({ dueCount = 0, streakAtRisk = false } = {}) {
  if (dueCount > 0) return `${dueCount} scroll${dueCount === 1 ? '' : 's'} await review in the dungeon.`;
  if (streakAtRisk) return 'Thy daily devotion streak is about to lapse — claim it before midnight.';
  return null;
}

export function showStudyReminder(signal) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const body = buildReminderText(signal);
  if (!body) return false;
  try {
    new Notification('Dungeon Scholar', { body, tag: 'dungeon-scholar-study' });
    return true;
  } catch {
    return false;
  }
}
