// Local YYYY-MM-DD formatting (avoids UTC drift across midnight).
// Canonical home for the date string previously duplicated across
// services/devotion.js and game/quests.js (S22).
export const formatYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayDateStr = () => formatYmd(new Date());
