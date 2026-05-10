// Phase 26b: weak-domain auto-targeting.
//
// Given the player's per-domain accuracy and the set of domains that
// have matching study items in the tome they'll study against, pick
// the single domain that most warrants a one-click "practice this"
// shortcut. Used by DomainStudyScreen to surface a prominent CTA so
// the player doesn't have to scan every row to find their weak spot.

const MIN_SAMPLE = 5;
const ACCURACY_THRESHOLD = 0.75;

export const WEAK_DOMAIN_MIN_SAMPLE = MIN_SAMPLE;
export const WEAK_DOMAIN_ACCURACY_THRESHOLD = ACCURACY_THRESHOLD;

export function pickWeakestDomain(stats, candidateDomains, weights) {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  const filterSet = (candidateDomains instanceof Set) ? candidateDomains : null;
  const candidates = stats.filter((s) => {
    if (!s || typeof s.domain !== 'string') return false;
    if (s.domain === 'Uncategorized') return false;
    if (typeof s.total !== 'number' || s.total < MIN_SAMPLE) return false;
    if (typeof s.accuracy !== 'number' || !Number.isFinite(s.accuracy)) return false;
    if (s.accuracy >= ACCURACY_THRESHOLD) return false;
    if (filterSet && !filterSet.has(s.domain)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    if (weights) {
      const aw = Number(weights[a.domain] || 0);
      const bw = Number(weights[b.domain] || 0);
      if (aw !== bw) return bw - aw;
    }
    return b.total - a.total;
  });
  return sorted[0];
}
