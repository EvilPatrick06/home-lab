// Daily Devotion calendar (Phase 20). 7-day reward cycle. The scholar's
// loginStreak determines the cycleDay (1-7); each day yields a fixed
// reward and a small devotion bonus that scales with the day. Day 7
// is a major reward; the cycle then loops.

export const DAILY_REWARDS = [
  // Day 1
  { day: 1, gold: 30,  xp: 10,  devotion: 1, items: [],                                   label: 'A Modest Tribute' },
  // Day 2
  { day: 2, gold: 50,  xp: 20,  devotion: 1, items: [{ id: 'minor_heal_tonic', n: 1 }],   label: "A Healer's Gift" },
  // Day 3
  { day: 3, gold: 70,  xp: 30,  devotion: 2, items: [{ id: 'shield_draught', n: 1 }],     label: "A Warden's Bond" },
  // Day 4
  { day: 4, gold: 100, xp: 50,  devotion: 2, items: [{ id: 'scholars_brew', n: 1 }],      label: "The Scholar's Cup" },
  // Day 5
  { day: 5, gold: 150, xp: 75,  devotion: 3, items: [{ id: 'foresight_scroll', n: 1 }],   label: 'Eyes Beyond' },
  // Day 6
  { day: 6, gold: 200, xp: 100, devotion: 3, items: [{ id: 'greater_heal_tonic', n: 1 }], label: 'The Greater Draught' },
  // Day 7 — capstone
  { day: 7, gold: 350, xp: 200, devotion: 5, items: [{ id: 'phoenix_ember', n: 1 }],      label: 'The Phoenix Day', capstone: true },
];

// Local YYYY-MM-DD (avoid UTC drift across midnight).
export const todayDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Number of calendar days between two YYYY-MM-DD strings (b - a).
// Returns Infinity if either is missing.
export const dayDiff = (a, b) => {
  if (!a || !b) return Infinity;
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
};

// Pure helper: given today's date string, the player's last claimed date,
// and current login streak, return the cycle state if a claim were made
// right now. Used by both the calendar UI preview and the actual claim.
export const computeNextClaim = (today, lastClaimedDate, currentStreak) => {
  const claimedToday = lastClaimedDate === today;
  if (claimedToday) {
    const cycleDay = currentStreak > 0 ? ((currentStreak - 1) % 7) + 1 : 1;
    return { claimedToday: true, willStreak: currentStreak, cycleDay };
  }
  const gap = lastClaimedDate ? dayDiff(lastClaimedDate, today) : null;
  const willStreak = gap === 1 ? (currentStreak || 0) + 1 : 1;
  const cycleDay = ((willStreak - 1) % 7) + 1;
  return { claimedToday: false, willStreak, cycleDay };
};
