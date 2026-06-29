// Phase 26g: spaced-repetition scheduling for flashcards.
//
// FSRS-5 (Free Spaced Repetition Scheduler, v5). This replaces the earlier
// "FSRS-inspired" simplification with the canonical FSRS-5 stability/difficulty
// update equations and the published default weight vector (19 params). The
// public API and the per-card state shape are unchanged, so existing saved
// cards and every caller keep working:
//
//   { stability, difficulty, reps, lapses, lastReview, dueAt }
//
// stability  — days until retrievability is expected to fall to DESIRED_RETENTION
// difficulty — 1 (easy for this user) ... 10 (very hard for this user)
// reps       — total review events ever
// lapses     — count of Again ratings ever
// lastReview — ms timestamp of the most recent rating
// dueAt      — ms timestamp at which the card becomes due again
//
// Refs: the FSRS-5 algorithm spec (open-spaced-repetition). The weights below
// are the FSRS-5 defaults; a future enhancement can fit them per-user from the
// recorded review history and feed them in via setSchedulerWeights() — the
// equations already read from the module-level weight vector for that reason.

const DAY_MS = 86400000;
const S_MIN = 0.1;
const S_MAX = 365 * 5;
const D_MIN = 1;
const D_MAX = 10;

// FSRS-5 power-law forgetting curve constants.
export const DECAY = -0.5;
// FACTOR = 0.9^(1/DECAY) - 1 = 0.9^-2 - 1 = 19/81 ≈ 0.234567901.
export const FACTOR = 0.9 ** (1 / DECAY) - 1;

// Target retention used to convert stability -> next interval. 0.9 = the FSRS
// default (review when recall probability drops to ~90%).
export const DESIRED_RETENTION = 0.9;

// Canonical FSRS-5 default weights (w0..w18).
export const FSRS_DEFAULT_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

// Active weight vector. Defaults to FSRS-5; setSchedulerWeights() lets a future
// per-user optimizer swap in fitted weights without touching the equations.
let W = FSRS_DEFAULT_WEIGHTS.slice();

export function setSchedulerWeights(weights) {
  if (Array.isArray(weights) && weights.length === 19 && weights.every((n) => Number.isFinite(n))) {
    W = weights.slice();
    return true;
  }
  return false;
}

export function getSchedulerWeights() {
  return W.slice();
}

export const SRS_RATINGS = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function validRating(r) {
  return r === 1 || r === 2 || r === 3 || r === 4;
}

function isNew(state) {
  return !state || typeof state.stability !== 'number' || typeof state.reps !== 'number' || state.reps <= 0;
}

// --- FSRS-5 core equations --------------------------------------------------

function initialStability(rating) {
  // S0(G) = w[G-1].
  return clamp(W[rating - 1], S_MIN, S_MAX);
}

function initialDifficulty(rating) {
  // D0(G) = w4 - exp(w5 * (G - 1)) + 1.
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, D_MIN, D_MAX);
}

function nextDifficulty(D, rating) {
  // Linear-damped delta + mean reversion toward D0(easy).
  const deltaD = -W[6] * (rating - 3);
  const dampened = D + deltaD * ((10 - D) / 9);
  const reverted = W[7] * initialDifficulty(4) + (1 - W[7]) * dampened;
  return clamp(reverted, D_MIN, D_MAX);
}

function stabilityAfterRecall(D, S, R, rating) {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const inc = Math.exp(W[8]) * (11 - D) * S ** -W[9] * (Math.exp(W[10] * (1 - R)) - 1) * hardPenalty * easyBonus + 1;
  return clamp(S * inc, S_MIN, S_MAX);
}

function stabilityAfterForget(D, S, R) {
  const sForget = W[11] * D ** -W[12] * ((S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R));
  // Post-lapse stability never exceeds the pre-lapse stability.
  return clamp(Math.min(sForget, S), S_MIN, S_MAX);
}

function stabilityShortTerm(S, rating) {
  // Same-day review: S' = S * exp(w17 * (G - 3 + w18)).
  return clamp(S * Math.exp(W[17] * (rating - 3 + W[18])), S_MIN, S_MAX);
}

function intervalDays(S) {
  // I = (S / FACTOR) * (DESIRED_RETENTION^(1/DECAY) - 1).
  const days = (S / FACTOR) * (DESIRED_RETENTION ** (1 / DECAY) - 1);
  return Math.max(1, Math.round(days));
}

export function retrievability(state, now = Date.now()) {
  if (isNew(state) || state.stability <= 0) return 0;
  const elapsedDays = Math.max(0, (now - state.lastReview) / DAY_MS);
  return (1 + FACTOR * (elapsedDays / state.stability)) ** DECAY;
}

export function scheduleCard(prevState, rating, now = Date.now()) {
  if (!validRating(rating)) return prevState || null;

  if (isNew(prevState)) {
    const S = initialStability(rating);
    const D = initialDifficulty(rating);
    return {
      stability: S,
      difficulty: D,
      reps: 1,
      lapses: rating === 1 ? 1 : 0,
      lastReview: now,
      dueAt: now + intervalDays(S) * DAY_MS,
    };
  }

  const S = clamp(prevState.stability, S_MIN, S_MAX);
  const D = clamp(prevState.difficulty, D_MIN, D_MAX);
  const lastReview = typeof prevState.lastReview === 'number' ? prevState.lastReview : now;
  const elapsedDays = Math.max(0, (now - lastReview) / DAY_MS);
  const R = (1 + FACTOR * (elapsedDays / S)) ** DECAY;

  const newD = nextDifficulty(D, rating);

  let newS;
  if (elapsedDays < 1) {
    // Same-day repeat — short-term stability update.
    newS = stabilityShortTerm(S, rating);
  } else if (rating === 1) {
    newS = stabilityAfterForget(D, S, R);
  } else {
    newS = stabilityAfterRecall(D, S, R, rating);
  }

  return {
    stability: newS,
    difficulty: newD,
    reps: (prevState.reps || 0) + 1,
    lapses: (prevState.lapses || 0) + (rating === 1 ? 1 : 0),
    lastReview: now,
    dueAt: now + intervalDays(newS) * DAY_MS,
  };
}

export function isCardDue(state, now = Date.now()) {
  // Leeches/cards the learner suspended are pulled out of the due queue
  // entirely (services/leech.js). Backward-compatible: absent flag = due as
  // before.
  if (state && state.suspended === true) return false;
  if (isNew(state)) return true;
  if (typeof state.dueAt !== 'number') return true;
  return state.dueAt <= now;
}

export function dueCount(cardProgressMap, allCards, now = Date.now()) {
  const map = cardProgressMap && typeof cardProgressMap === 'object' ? cardProgressMap : {};
  const cards = Array.isArray(allCards) ? allCards : [];
  let n = 0;
  for (const c of cards) {
    if (!c || typeof c.id !== 'string') continue;
    if (isCardDue(map[c.id], now)) n += 1;
  }
  return n;
}

export function sortByDueness(cards, cardProgressMap, now = Date.now()) {
  const map = cardProgressMap && typeof cardProgressMap === 'object' ? cardProgressMap : {};
  const list = Array.isArray(cards) ? cards.slice() : [];
  return list.sort((a, b) => {
    const sa = map[a?.id];
    const sb = map[b?.id];
    const dueA = sa && typeof sa.dueAt === 'number' ? sa.dueAt : -Infinity;
    const dueB = sb && typeof sb.dueAt === 'number' ? sb.dueAt : -Infinity;
    return dueA - dueB;
  });
}

export function filterDue(cards, cardProgressMap, now = Date.now()) {
  const map = cardProgressMap && typeof cardProgressMap === 'object' ? cardProgressMap : {};
  return (Array.isArray(cards) ? cards : []).filter((c) => c && typeof c.id === 'string' && isCardDue(map[c.id], now));
}
