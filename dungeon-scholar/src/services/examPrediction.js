// Phase 26d: predicted exam score.
//
// Given the player's per-domain accuracy stats and the tome's
// `metadata.domainWeights` blueprint, estimate the score they would
// post on the real exam today. We compute over *covered* domains only
// (those with the minimum sample size) and report coverage as a
// reliability indicator — predicting from a thin slice of the
// blueprint is dishonest, and we'd rather flag the gap than fake a
// number.

const MIN_SAMPLE = 5;
const HIGH_COVERAGE = 75;
const MEDIUM_COVERAGE = 25;

export const PREDICTION_MIN_SAMPLE = MIN_SAMPLE;
export const PREDICTION_HIGH_COVERAGE = HIGH_COVERAGE;
export const PREDICTION_MEDIUM_COVERAGE = MEDIUM_COVERAGE;

export function computeExamPrediction(stats, weights) {
  if (!weights || typeof weights !== 'object') return null;
  const weightEntries = Object.entries(weights)
    .map(([k, v]) => [k, Number(v)])
    .filter(([, v]) => Number.isFinite(v) && v > 0);
  if (weightEntries.length === 0) return null;
  const totalWeight = weightEntries.reduce((sum, [, v]) => sum + v, 0);
  if (totalWeight <= 0) return null;

  const statsMap = new Map();
  (Array.isArray(stats) ? stats : []).forEach((s) => {
    if (s && typeof s.domain === 'string') statsMap.set(s.domain, s);
  });

  let sampledWeight = 0;
  let weightedAccSum = 0;
  let sampledDomains = 0;
  const missingDomains = [];

  weightEntries.forEach(([domain, weight]) => {
    const s = statsMap.get(domain);
    const total = s && typeof s.total === 'number' ? s.total : 0;
    const accuracy = s && typeof s.accuracy === 'number' && Number.isFinite(s.accuracy) ? s.accuracy : 0;
    if (total < MIN_SAMPLE) {
      missingDomains.push({ domain, weight });
      return;
    }
    sampledWeight += weight;
    weightedAccSum += weight * accuracy;
    sampledDomains += 1;
  });

  const coveragePct = Math.round((sampledWeight / totalWeight) * 100);

  if (sampledWeight === 0) {
    return {
      predictedPct: null,
      coveragePct: 0,
      sampledDomains,
      totalDomains: weightEntries.length,
      missingDomains,
      confidence: 'none',
    };
  }

  const predictedPct = Math.round((weightedAccSum / sampledWeight) * 100);
  const confidence = coveragePct >= HIGH_COVERAGE
    ? 'high'
    : coveragePct >= MEDIUM_COVERAGE
      ? 'medium'
      : 'low';

  return {
    predictedPct,
    coveragePct,
    sampledDomains,
    totalDomains: weightEntries.length,
    missingDomains,
    confidence,
  };
}
