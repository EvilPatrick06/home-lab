// Leech detection — flag (and optionally suspend) chronic-lapse cards.
//
// The FSRS-5 scheduler already records a per-card `lapses` counter
// (`services/srs.js` — incremented on every Again/rating-1 review), but until
// now nothing in the app ever *read* it. A card the learner keeps forgetting
// just cycles back into the due queue indefinitely, burning review time on
// material that isn't sticking. Anki's "leech" mechanic is the standard answer:
// once a card crosses a lapse threshold (commonly 8), flag it so the learner
// (or tome author) can rewrite it, split it into smaller cards, add a
// mnemonic/hint, or temporarily suspend it from the queue.
//
// This module is the consumer that was missing. Pure helpers, unit-tested like
// the other SRS helpers; the threshold is exported as a constant (consistent
// with `weakDomain.js` / `examPrediction.js` exposing their tuning constants).

const LAPSE_THRESHOLD = 8;

export const LEECH_LAPSE_THRESHOLD = LAPSE_THRESHOLD;

// True when a single card's FSRS state has lapsed at least `threshold` times.
// Defensive: a missing / malformed state simply isn't a leech.
export function isLeech(cardState, threshold = LAPSE_THRESHOLD) {
  if (!cardState || typeof cardState !== 'object') return false;
  const lapses = typeof cardState.lapses === 'number' ? cardState.lapses : 0;
  return lapses >= threshold;
}

// Count leeches in a cardProgress map. Cheap; used for badge / summary counts.
export function leechCount(cardProgress, threshold = LAPSE_THRESHOLD) {
  const map = cardProgress && typeof cardProgress === 'object' ? cardProgress : {};
  let n = 0;
  for (const st of Object.values(map)) {
    if (isLeech(st, threshold)) n += 1;
  }
  return n;
}

// List the leeches in a cardProgress map, worst-first.
// Returns [{ id, lapses, reps, dueAt, suspended, front, back, domain }].
// Pass `cards` (the tome's flashcards) to attach front/back/domain for display;
// ids without a matching card still appear (content fields null) so orphaned
// progress entries remain visible.
export function listLeeches(cardProgress, cards = null, threshold = LAPSE_THRESHOLD) {
  const map = cardProgress && typeof cardProgress === 'object' ? cardProgress : {};
  const byId = new Map();
  if (Array.isArray(cards)) {
    for (const c of cards) {
      if (c && typeof c.id === 'string') byId.set(c.id, c);
    }
  }
  const out = [];
  for (const [id, st] of Object.entries(map)) {
    if (!isLeech(st, threshold)) continue;
    const card = byId.get(id) || null;
    out.push({
      id,
      lapses: typeof st.lapses === 'number' ? st.lapses : 0,
      reps: typeof st.reps === 'number' ? st.reps : 0,
      dueAt: typeof st.dueAt === 'number' ? st.dueAt : null,
      suspended: !!st.suspended,
      front: card && typeof card.front === 'string' ? card.front : null,
      back: card && typeof card.back === 'string' ? card.back : null,
      domain: card && typeof card.domain === 'string' ? card.domain : null,
    });
  }
  out.sort((a, b) => b.lapses - a.lapses || a.id.localeCompare(b.id));
  return out;
}
