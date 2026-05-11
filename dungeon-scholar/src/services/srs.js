// Phase 26g: spaced-repetition scheduling for flashcards.
//
// FSRS-inspired (not literal FSRS-5 with 17+ weights — a simpler model
// that captures the spirit: stability grows on success, scaled by an
// inverse-difficulty multiplier, and resets sharply on lapses). Each
// card carries:
//
//   { stability, difficulty, reps, lapses, lastReview, dueAt }
//
// stability  — days the memory holds before recall is expected to drop
//              below ~90% retrievability
// difficulty — 1 (easy for this user) ... 10 (very hard for this user)
// reps       — total review events ever
// lapses     — count of Again ratings ever
// lastReview — ms timestamp of the most recent rating
// dueAt      — ms timestamp at which the card becomes due again

const DAY_MS = 86400000;
const S_MIN = 0.1;
const S_MAX = 365 * 5;
const D_MIN = 1;
const D_MAX = 10;

export const SRS_RATINGS = {
  again: 1,
  hard:  2,
  good:  3,
  easy:  4,
};

const INITIAL_STABILITY = { 1: 0.4, 2: 1.0, 3: 3.0, 4: 7.0 };
const INITIAL_DIFFICULTY = { 1: 7.5, 2: 6.0, 3: 5.0, 4: 4.0 };

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

export function retrievability(state, now = Date.now()) {
  if (isNew(state) || state.stability <= 0) return 0;
  const elapsedDays = Math.max(0, (now - state.lastReview) / DAY_MS);
  return Math.pow(1 + elapsedDays / (9 * state.stability), -1);
}

export function scheduleCard(prevState, rating, now = Date.now()) {
  if (!validRating(rating)) return prevState || null;
  if (isNew(prevState)) {
    const S = INITIAL_STABILITY[rating];
    const D = INITIAL_DIFFICULTY[rating];
    return {
      stability: clamp(S, S_MIN, S_MAX),
      difficulty: clamp(D, D_MIN, D_MAX),
      reps: 1,
      lapses: rating === 1 ? 1 : 0,
      lastReview: now,
      dueAt: now + Math.round(S * DAY_MS),
    };
  }

  const S = clamp(prevState.stability, S_MIN, S_MAX);
  const D = clamp(prevState.difficulty, D_MIN, D_MAX);

  let newS;
  let newD;
  if (rating === 1) {
    newS = S * 0.2;
    newD = D + 1.5;
  } else {
    // Use a guarded read for lastReview — 0 is a valid epoch timestamp
    // that `prevState.lastReview || now` would silently swap for `now`.
    const lastReview = typeof prevState.lastReview === 'number' ? prevState.lastReview : now;
    const elapsedDays = Math.max(0, (now - lastReview) / DAY_MS);
    const overdueBoost = 1 + Math.max(0, (elapsedDays / S) - 1) * 0.1;
    const diffMult = 1 + (D_MAX - D) / 20;
    const ratingMult = rating === 2 ? 1.2 : rating === 3 ? 2.5 : 3.5;
    newS = S * ratingMult * diffMult * overdueBoost;
    newD = rating === 2 ? D + 0.15 : rating === 3 ? D : D - 0.15;
  }

  newS = clamp(newS, S_MIN, S_MAX);
  newD = clamp(newD, D_MIN, D_MAX);

  return {
    stability: newS,
    difficulty: newD,
    reps: (prevState.reps || 0) + 1,
    lapses: (prevState.lapses || 0) + (rating === 1 ? 1 : 0),
    lastReview: now,
    dueAt: now + Math.round(newS * DAY_MS),
  };
}

export function isCardDue(state, now = Date.now()) {
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
    const dueA = (sa && typeof sa.dueAt === 'number') ? sa.dueAt : -Infinity;
    const dueB = (sb && typeof sb.dueAt === 'number') ? sb.dueAt : -Infinity;
    return dueA - dueB;
  });
}

export function filterDue(cards, cardProgressMap, now = Date.now()) {
  const map = cardProgressMap && typeof cardProgressMap === 'object' ? cardProgressMap : {};
  return (Array.isArray(cards) ? cards : []).filter(c => c && typeof c.id === 'string' && isCardDue(map[c.id], now));
}
