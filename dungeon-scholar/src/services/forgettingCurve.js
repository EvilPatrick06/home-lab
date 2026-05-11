// Phase 26h: forgetting-curve aggregation.
//
// Uses the same retrievability formula as the SRS scheduler
// (R = (1 + elapsed_days / (9 × stability))^-1) but projects it
// forward across a window of future days so the Domain Codex can plot
// "what will my retention look like a week from now if I skip reviews?"
//
// Cards without SRS state (never rated) are EXCLUDED from the average
// — they're "new" and haven't entered the decay curve yet. Reporting
// them as 100% would mask actual decay; reporting them as 0% would
// over-pessimize. Excluding them is honest about what the forecast
// covers and lets the UI show coverage as "N of M scrolls rated".

const DAY_MS = 86400000;

function pickFinite(n, fallback) {
  return (typeof n === 'number' && Number.isFinite(n)) ? n : fallback;
}

function isUsableState(s) {
  if (!s || typeof s !== 'object') return false;
  const stability = pickFinite(s.stability, NaN);
  const lastReview = pickFinite(s.lastReview, NaN);
  if (!Number.isFinite(stability) || stability <= 0) return false;
  if (!Number.isFinite(lastReview)) return false;
  return true;
}

export function retrievabilityAt(state, atTime) {
  if (!isUsableState(state)) return null;
  const elapsedDays = Math.max(0, (atTime - state.lastReview) / DAY_MS);
  return Math.pow(1 + elapsedDays / (9 * state.stability), -1);
}

export function computeAverageRetrievability(stateList, atTime) {
  const list = Array.isArray(stateList) ? stateList : [];
  let sum = 0;
  let n = 0;
  for (const s of list) {
    const r = retrievabilityAt(s, atTime);
    if (r !== null) {
      sum += r;
      n += 1;
    }
  }
  if (n === 0) return { mean: null, sampleSize: 0 };
  return { mean: sum / n, sampleSize: n };
}

export function computeRetentionCurve(stateList, options = {}) {
  const now = pickFinite(options.now, Date.now());
  const maxDays = Math.max(1, pickFinite(options.maxDays, 30));
  const samples = Math.max(2, Math.floor(pickFinite(options.samples, 30)));
  const step = maxDays / (samples - 1);
  const points = [];
  for (let i = 0; i < samples; i++) {
    const offsetDays = i * step;
    const t = now + offsetDays * DAY_MS;
    const { mean, sampleSize } = computeAverageRetrievability(stateList, t);
    points.push({
      offsetDays,
      pct: mean === null ? null : mean * 100,
      sampleSize,
    });
  }
  return points;
}

const DEFAULT_MILESTONE_OFFSETS = [0, 1, 7, 30];

export function computeMilestones(stateList, options = {}) {
  const now = pickFinite(options.now, Date.now());
  const offsets = Array.isArray(options.offsets) && options.offsets.length > 0
    ? options.offsets.map(o => pickFinite(o, 0))
    : DEFAULT_MILESTONE_OFFSETS;
  return offsets.map(offsetDays => {
    const t = now + offsetDays * DAY_MS;
    const { mean, sampleSize } = computeAverageRetrievability(stateList, t);
    return {
      offsetDays,
      pct: mean === null ? null : mean * 100,
      sampleSize,
    };
  });
}
