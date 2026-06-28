// Optional per-item content fields (back-compatible; absent = feature off):
//   flashcard: { id, front, back, domain?, hint? }
//   quiz:      { id, question, options[], correctIndex, explanation?, hint? }
// `hint` is a learner-facing nudge revealed on demand before the answer
// (FlashcardsMode / QuizMode "Show hint"); authored in TomeEditor.
export const generateTomeId = () => `tome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Compress/decompress utilities for tome share codes.
// We use a simple base64+JSON approach (no external libs available in artifacts).
// The result is a reasonably long but copy-pasteable code.
export const encodeTomeShareCode = (data) => {
  try {
    const json = JSON.stringify(data);
    // Convert to base64 (handles unicode via encodeURIComponent trick)
    const b64 = btoa(unescape(encodeURIComponent(json)));
    // Wrap in a recognizable header for validation
    return `TOME-V1:${b64}`;
  } catch (e) {
    return null;
  }
};

export const decodeTomeShareCode = (code) => {
  try {
    let cleaned = code.trim();
    // Tolerate users wrapping the code in quotes or whitespace
    cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '');
    if (!cleaned.startsWith('TOME-V1:')) return null;
    const b64 = cleaned.slice('TOME-V1:'.length);
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
};

// PHASE-19 19A: the per-modal Escape hook (useEscapeKey) was replaced by
// useDialogA11y (focus trap + Escape + focus restore) across every overlay.

// Fisher-Yates shuffle. Returns a new array; doesn't mutate input.
export const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Some AI-generated tomes use `stages` instead of `steps` for lab steps. Normalize
// at import time so the rest of the app can rely on the canonical `steps` field.
// Idempotent — won't touch labs that already have `steps`.
export const normalizeTomeData = (data) => {
  if (!data || !Array.isArray(data.labs)) return data;
  const labs = data.labs.map((lab) => {
    if (!lab || lab.steps || !Array.isArray(lab.stages)) return lab;
    return { ...lab, steps: lab.stages };
  });
  return { ...data, labs };
};

export const blankTomeProgress = () => ({
  cardsReviewed: 0,
  quizAnswered: 0,
  labsCompleted: 0,
  labsAttempted: 0,
  oracleMessages: 0,
  runsCompleted: 0,
  bossesDefeated: 0,
  cardProgress: {},
  questionStats: {},
  labProgress: {},
  mistakeVault: [],
  chatHistory: [],
  runHistory: [], // Phase 10: per-tome list of completed/failed dungeon runs
  // Phase 30e QA #10: per-domain answer counts for the Domain Codex. Bumped
  // by recordAnswer for every answered item that carries a `domain` tag —
  // covers Quiz, Riddles, Flashcards, Labs, and Oracle paths, not just
  // dungeon delves (which were previously the Codex's only data source).
  domainStats: {}, // { [domain]: { total, correct } }
  // Phase 26a: confidence calibration. Each bucket counts answer events
  // where the user rated their confidence + whether the answer was correct.
  // Used by the Domain Study screen's Calibration section to surface
  // overconfidence / underconfidence patterns.
  confidenceStats: {
    low: { total: 0, correct: 0 },
    med: { total: 0, correct: 0 },
    high: { total: 0, correct: 0 },
  },
  // Phase 26c: optional YYYY-MM-DD exam date. When set, the Domain Codex
  // computes a daily-target pace so the player knows how many riddles a
  // day to attempt before the exam arrives.
  examDate: null,
  // Phase 26e: capped history of timed practice-exam runs. Each entry:
  // { startedAt, durationSec, totalCount, answered, correct, scorePct,
  //   byDomain: { [domain]: { total, answered, correct } }, status }.
  practiceExams: [],
});

// === Run History (Phase 10) ===
// Aggregates statistics across a tome's runHistory for the personal-records
// header. All runs included whether won or lost; "fastest win" filters to wins.
export const summarizeRunHistory = (history) => {
  const runs = Array.isArray(history) ? history : [];
  const wins = runs.filter((r) => r.won);
  const fastestWin = wins.reduce((best, r) => (best == null || r.durationSec < best.durationSec ? r : best), null);
  const highestScore = runs.reduce((best, r) => (best == null || (r.score || 0) > (best.score || 0) ? r : best), null);
  const longestStreak = runs.reduce(
    (best, r) => (best == null || (r.maxStreak || 0) > (best.maxStreak || 0) ? r : best),
    null,
  );
  const totalWins = wins.length;
  const totalRuns = runs.length;
  const winRate = totalRuns > 0 ? totalWins / totalRuns : 0;
  return { runs, wins, fastestWin, highestScore, longestStreak, totalWins, totalRuns, winRate };
};

export const formatDuration = (sec) => {
  if (!sec || !isFinite(sec)) return '—';
  const total = Math.round(sec);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};
