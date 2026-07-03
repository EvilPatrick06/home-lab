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
// default (review when recall probability drops to ~90%). This is the FSRS
// "desired retention" knob, exposed to the learner (SRS knobs): closer to an
// exam a learner rationally wants higher retention (more reviews, higher
// recall), a casual learner lower. setDesiredRetention swaps the active value;
// it only rescales FUTURE intervals -- stored per-card state is untouched, so
// changing it never rewrites history. Kept exported for back-compat (default).
export const DESIRED_RETENTION = 0.9;
export const RETENTION_MIN = 0.8;
export const RETENTION_MAX = 0.97;

let activeRetention = DESIRED_RETENTION;

// Set the active desired-retention. Clamps to [RETENTION_MIN, RETENTION_MAX]
// and ignores non-finite input (returns the value actually applied).
export function setDesiredRetention(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return activeRetention;
  activeRetention = clamp(n, RETENTION_MIN, RETENTION_MAX);
  return activeRetention;
}

export function getDesiredRetention() {
  return activeRetention;
}

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
  // I = (S / FACTOR) * (retention^(1/DECAY) - 1). Reads the active desired
  // retention so the learner's knob rescales the next interval.
  const days = (S / FACTOR) * (activeRetention ** (1 / DECAY) - 1);
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

export function sortByDueness(cards, cardProgressMap, _now = Date.now()) {
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

// ── Daily new-card cap (SRS knobs) ──────────────────────────────────────────
//
// Importing a large tome floods the due queue with hundreds of NEW (never-
// reviewed) cards at once — the classic overwhelm-then-abandon failure mode
// every mature SRS mitigates with a new-cards/day limit (Anki defaults to 20).
// These pure helpers let a study session admit at most N new cards while never
// capping review (already-learned) cards, which should always all come due.

export const NEW_CARD_CAP_DEFAULT = 20;
export const NEW_CARD_CAP_MIN = 0;
export const NEW_CARD_CAP_MAX = 999;

// Clamp/normalize a user-supplied new-card cap. Non-finite -> default.
export function normalizeNewCardCap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return NEW_CARD_CAP_DEFAULT;
  return Math.min(NEW_CARD_CAP_MAX, Math.max(NEW_CARD_CAP_MIN, Math.floor(v)));
}

// A card is "new" when it has no reps recorded yet (never reviewed).
function isNewCard(state) {
  return isNew(state);
}

/**
 * Apply a daily new-card cap to a due-ordered deck. Review cards (already
 * learned) pass through untouched and keep their order; new cards beyond the
 * cap are dropped from THIS session's queue (they surface on a future day when
 * the cap frees up). `alreadySeenToday` lets a caller account for new cards
 * already studied earlier the same day so the cap is a true daily budget.
 *
 * @param {Array} deck — cards ({ id }), ideally already due-sorted.
 * @param {object} cardProgressMap — { [id]: srsState }.
 * @param {number} cap — max new cards to admit (see normalizeNewCardCap).
 * @param {{ alreadySeenToday?: number }} [opts]
 * @returns {Array} the admitted subset (a new array; input not mutated).
 */
export function capNewCards(deck, cardProgressMap, cap, { alreadySeenToday = 0 } = {}) {
  const list = Array.isArray(deck) ? deck : [];
  const map = cardProgressMap && typeof cardProgressMap === 'object' ? cardProgressMap : {};
  const limit = normalizeNewCardCap(cap);
  let budget = Math.max(0, limit - Math.max(0, Math.floor(alreadySeenToday)));
  const out = [];
  for (const card of list) {
    if (!card || typeof card.id !== 'string') continue;
    if (isNewCard(map[card.id])) {
      if (budget <= 0) continue; // over the daily new-card budget — defer
      budget -= 1;
    }
    out.push(card);
  }
  return out;
}
