// Cross-tome comprehensive practice exam (sugg-cross-tome-exam).
//
// Every practice exam was scoped to a single tome. Real certifications are
// comprehensive: a learner studying several sub-topic tomes has no way to sit
// one timed exam sampling across all of them - the highest-fidelity rehearsal
// and the best way to surface cross-domain weak spots. This pure core pools quiz
// items from multiple selected tomes and samples across them, weighted toward
// the learner's WEAK domains, so the exam spends more questions where recall is
// shakiest. Reuses the tome domain/accuracy signals the app already tracks.

// Collect a flat, id-namespaced quiz pool across the selected tomes so ids stay
// unique even if two tomes reuse an id. Each item keeps its `domain` tag.
export function poolCrossTomeQuiz(tomes) {
  const pool = [];
  for (const t of Array.isArray(tomes) ? tomes : []) {
    const tid = (t && (t.id || (t.data && t.data.id))) || 'tome';
    const quiz = t && t.data && Array.isArray(t.data.quiz) ? t.data.quiz : [];
    for (const q of quiz) {
      if (!q || typeof q !== 'object') continue;
      pool.push({ ...q, id: `${tid}::${q.id ?? pool.length}`, sourceTomeId: tid });
    }
  }
  return pool;
}

// Aggregate per-domain accuracy across the selected tomes' progress
// (domainStats: { [domain]: { total, correct } }). Returns { [domain]: acc }.
export function aggregateDomainAccuracy(tomes) {
  const totals = {};
  for (const t of Array.isArray(tomes) ? tomes : []) {
    const ds = t && t.progress && t.progress.domainStats;
    if (!ds || typeof ds !== 'object') continue;
    for (const [domain, tile] of Object.entries(ds)) {
      if (!totals[domain]) totals[domain] = { total: 0, correct: 0 };
      totals[domain].total += (tile && tile.total) || 0;
      totals[domain].correct += (tile && tile.correct) || 0;
    }
  }
  const acc = {};
  for (const [d, tile] of Object.entries(totals)) {
    acc[d] = tile.total > 0 ? tile.correct / tile.total : null;
  }
  return acc;
}

/**
 * Build weak-domain sampling weights from the pooled items + aggregated
 * accuracy. Every domain present in the pool gets a base weight of 1; a domain
 * with recorded accuracy gets a bonus inversely proportional to accuracy
 * (weaker => heavier), so the exam over-samples shaky domains without ignoring
 * the strong ones. Domains with no accuracy data keep the neutral base weight.
 * @param {object[]} pool - pooled quiz items (each with a `domain`).
 * @param {Object<string, number|null>} domainAccuracy
 * @returns {Object<string, number>}
 */
export function weakDomainWeights(pool, domainAccuracy) {
  const UNCAT = 'Uncategorized';
  const present = new Set();
  for (const q of Array.isArray(pool) ? pool : []) {
    present.add((q && typeof q.domain === 'string' && q.domain) || UNCAT);
  }
  /** @type {Object<string, number>} */
  const weights = {};
  for (const domain of present) {
    const acc = domainAccuracy ? domainAccuracy[domain] : null;
    // base 1 + up to +2 for a fully-wrong domain (acc 0 => weight 3, acc 1 => 1).
    const bonus = typeof acc === 'number' && Number.isFinite(acc) ? 2 * (1 - Math.max(0, Math.min(1, acc))) : 0;
    weights[domain] = 1 + bonus;
  }
  return weights;
}
