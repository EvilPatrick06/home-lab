// PHASE-19 19D: milestone announcements for the exam countdown (L5). Returns a
// message when the remaining time crosses a threshold between two ticks, else
// null. Thresholds descend so a resume that jumps past several only fires the
// deepest crossed one.
const THRESHOLDS = [
  { sec: 1800, msg: '30 minutes remain in the trial.' },
  { sec: 600, msg: '10 minutes remain in the trial.' },
  { sec: 300, msg: '5 minutes remain in the trial.' },
  { sec: 60, msg: '1 minute remains in the trial.' },
];

export function timerAnnouncement(prevSeconds, nextSeconds) {
  // Track the LAST (deepest, since THRESHOLDS descend) crossed threshold so a
  // resume that skips several only announces the most accurate one (e.g.
  // 700→250 crosses 600 AND 300 → announce "5 minutes", not "10").
  let crossed = null;
  for (const t of THRESHOLDS) {
    if (prevSeconds > t.sec && nextSeconds <= t.sec) crossed = t.msg;
  }
  return crossed;
}
