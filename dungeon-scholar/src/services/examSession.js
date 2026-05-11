// Phase 26e: full-length practice exam session.
//
// Three pure helpers:
//   * pickStratifiedSample — stratified-by-blueprint question sampler
//   * gradeExamItem        — local MC/TF/FIB grader (no Oracle round-trip,
//                            so the timer doesn't get blocked on network)
//   * summarizeExamResults — total + per-domain breakdown for the results
//                            screen and the persisted history record.
//
// Sampling uses largest-remainder rounding so the per-domain counts sum
// exactly to the requested total without ever over-allocating. If a
// domain's pool can't satisfy its quota the remainder is filled from
// the global pool so the player still gets a full exam.

export const EXAM_PRESETS = [
  { id: 'short',    label: 'Short Mock',      count: 30, minutes: 30 },
  { id: 'standard', label: 'Standard Mock',   count: 60, minutes: 60 },
  { id: 'full',     label: 'Full-Length Exam', count: 90, minutes: 90 },
];

const UNCATEGORIZED_KEY = '__uncategorized__';

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickStratifiedSample(quiz, weights, totalCount, rng = Math.random) {
  const items = (Array.isArray(quiz) ? quiz : []).filter(q => q && typeof q.id === 'string');
  const count = Math.max(0, Math.floor(Number(totalCount) || 0));
  if (items.length === 0 || count === 0) return [];

  const byDomain = new Map();
  items.forEach(q => {
    const d = (typeof q.domain === 'string' && q.domain) ? q.domain : UNCATEGORIZED_KEY;
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(q);
  });

  const weightEntries = weights && typeof weights === 'object'
    ? Object.entries(weights)
      .map(([k, v]) => [k, Number(v)])
      .filter(([, v]) => Number.isFinite(v) && v > 0)
    : [];

  const targets = new Map();
  if (weightEntries.length > 0) {
    const totalWeight = weightEntries.reduce((s, [, v]) => s + v, 0);
    weightEntries.forEach(([d, w]) => {
      targets.set(d, (count * w) / totalWeight);
    });
  } else {
    const domains = Array.from(byDomain.keys());
    if (domains.length === 0) return [];
    const per = count / domains.length;
    domains.forEach(d => targets.set(d, per));
  }

  const rows = Array.from(targets.entries()).map(([domain, fractional]) => ({
    domain,
    fractional,
    floor: Math.floor(fractional),
    remainder: fractional - Math.floor(fractional),
  }));
  let allocated = rows.reduce((s, r) => s + r.floor, 0);
  rows.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < rows.length && allocated < count; i++) {
    rows[i].floor += 1;
    allocated += 1;
  }

  const picked = [];
  const pickedIds = new Set();
  rows.forEach(r => {
    const pool = byDomain.get(r.domain);
    if (!pool || pool.length === 0) return;
    const copy = pool.slice();
    shuffleInPlace(copy, rng);
    const take = Math.min(r.floor, copy.length);
    for (let i = 0; i < take; i++) {
      picked.push(copy[i]);
      pickedIds.add(copy[i].id);
    }
  });

  if (picked.length < count) {
    const leftovers = items.filter(q => !pickedIds.has(q.id));
    shuffleInPlace(leftovers, rng);
    const need = Math.min(count - picked.length, leftovers.length);
    for (let i = 0; i < need; i++) picked.push(leftovers[i]);
  }

  return shuffleInPlace(picked.slice(), rng);
}

function normalize(s) {
  return (typeof s === 'string' ? s : '').trim().toLowerCase();
}

export function gradeExamItem(question, answer) {
  if (!question) return false;
  if (Array.isArray(question.options)) {
    if (typeof answer !== 'number' || !Number.isInteger(answer)) return false;
    return answer === question.correctIndex;
  }
  if (question.type === 'truefalse') {
    if (typeof answer !== 'boolean') return false;
    return answer === !!question.correctAnswer;
  }
  if (question.type === 'fillblank' || question.type === 'fill_in_blank') {
    if (typeof answer !== 'string') return false;
    const user = normalize(answer);
    if (!user) return false;
    const expected = normalize(question.correctAnswer);
    const accepted = (Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [])
      .map(normalize)
      .filter(Boolean);
    if (expected && user === expected) return true;
    return accepted.includes(user);
  }
  return false;
}

export function summarizeExamResults(questions, answers) {
  const items = Array.isArray(questions) ? questions : [];
  const ans = Array.isArray(answers) ? answers : [];
  const byDomain = {};
  let correct = 0;
  let answered = 0;
  items.forEach((q, i) => {
    const a = ans[i];
    const isAnswered = (a !== null && a !== undefined && a !== '');
    if (isAnswered) answered += 1;
    const isCorrect = isAnswered && gradeExamItem(q, a);
    if (isCorrect) correct += 1;
    const d = (q && typeof q.domain === 'string' && q.domain) || 'Uncategorized';
    if (!byDomain[d]) byDomain[d] = { total: 0, answered: 0, correct: 0 };
    byDomain[d].total += 1;
    if (isAnswered) byDomain[d].answered += 1;
    if (isCorrect) byDomain[d].correct += 1;
  });
  const total = items.length;
  const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, answered, correct, scorePct, byDomain };
}
