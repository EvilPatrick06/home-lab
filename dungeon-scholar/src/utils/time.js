// Duration formatting helpers (S22). Shared home for the m/s formatting that
// was inlined across ExamMode and tome.js.
// formatMs: milliseconds -> 'Xm Ys'. formatSec: seconds -> 'M:SS'.
export const formatSec = (totalSec) => {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const formatMs = (ms) => {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
};
