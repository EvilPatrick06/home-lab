// Local YYYY-MM-DD formatting (avoids UTC drift across midnight).
// Canonical home for the date string previously duplicated across
// services/devotion.js and game/quests.js (S22).
export const formatYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayDateStr = () => formatYmd(new Date());

// User-facing calendar date, locale-independent (ISO YYYY-MM-DD).
// Accepts a Date, an ISO/string, or a number; returns `fallback` for
// missing/invalid input so call sites keep their current empty-state.
export const formatDateLabel = (value, fallback = '—') => {
  if (value == null) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : formatYmd(d);
};

// User-facing date + 24h clock time, locale-independent: "YYYY-MM-DD · HH:MM".
export const formatDateTimeLabel = (value, fallback = '—') => {
  if (value == null) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatYmd(d)} · ${hh}:${mm}`;
};
