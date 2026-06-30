// Optional per-item content fields (back-compatible; absent = feature off):
//   flashcard: { id, front, back, domain?, hint? }
//   quiz:      { id, question, options[], correctIndex, explanation?, hint? }
// `hint` is a learner-facing nudge revealed on demand before the answer
// (FlashcardsMode / QuizMode "Show hint"); authored in TomeEditor.
export const generateTomeId = () => `tome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Phase 40F per-tome `notes` is a device-local, passphrase-encrypted blob,
// stored as a SIBLING of `tome.data` (not inside it), so the normal export
// paths that serialize `tome.data` already exclude the user's own notes.
// This allowlist is the belt-and-suspenders guard: it drops `notes` (and any
// future local-only field) from any tome-data payload that is shared,
// exported, OR imported -- so an attacker-injected `data.notes` cannot ride in
// through import (normalizeTomeData spreads all incoming fields) and later
// leak back out, and a future refactor that nests notes can't regress.
const LOCAL_ONLY_TOME_FIELDS = ['notes'];
export const stripLocalOnlyTomeFields = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (!LOCAL_ONLY_TOME_FIELDS.some((k) => k in data)) return data; // unchanged ref when clean
  const out = { ...data };
  for (const k of LOCAL_ONLY_TOME_FIELDS) delete out[k];
  return out;
};

// Compress/decompress utilities for tome share codes.
// We use a simple base64+JSON approach (no external libs available in artifacts).
// The result is a reasonably long but copy-pasteable code.
export const encodeTomeShareCode = (data) => {
  try {
    const json = JSON.stringify(stripLocalOnlyTomeFields(data));
    // Convert to base64 (handles unicode via encodeURIComponent trick)
    const b64 = btoa(unescape(encodeURIComponent(json)));
    // Wrap in a recognizable header for validation
    return `TOME-V1:${b64}`;
  } catch (_e) {
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
  } catch (_e) {
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

// PHASE-04 04A: resolve a quiz item's answer key to canonical form. AI-generated
// decks often carry `answer`/`correct`/`correctAnswer` as a 0- or 1-based index,
// the option text, or a letter — none of which QuizMode grades (it reads
// `correctIndex` for MCQ, `correctAnswer` for true/false). Without this, such a
// deck imports "successfully" but grades every answer wrong.
const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 't', 'yes', 'y', '1'].includes(s)) return true;
    if (['false', 'f', 'no', 'n', '0'].includes(s)) return false;
  }
  return null;
};

const resolveCorrectIndex = (item, opts) => {
  const n = opts.length;
  const inRange = (i) => Number.isInteger(i) && i >= 0 && i < n;
  if (inRange(item.correctIndex)) return item.correctIndex;
  // numeric synonyms: accept 0-based, else fall back to 1-based when that lands in range
  for (const c of [item.correctIndex, item.answer, item.correct, item.correctAnswer]) {
    if (typeof c === 'number' && Number.isInteger(c)) {
      if (inRange(c)) return c;
      if (inRange(c - 1)) return c - 1;
    }
  }
  // string synonyms: numeric string, single letter, or exact option-text match
  for (const raw of [item.answer, item.correct, item.correctAnswer]) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim();
    if (/^\d+$/.test(s)) {
      const c = Number(s);
      if (inRange(c)) return c;
      if (inRange(c - 1)) return c - 1;
    }
    if (/^[a-z]$/i.test(s)) {
      const i = s.toLowerCase().charCodeAt(0) - 97;
      if (inRange(i)) return i;
    }
    const mi = opts.findIndex((o) => String(o).trim().toLowerCase() === s.toLowerCase());
    if (mi >= 0) return mi;
  }
  return null;
};

// Returns { item, ok }. ok=false => the item has no gradeable answer key.
const resolveQuizItem = (item) => {
  if (!item || typeof item !== 'object') return { item, ok: false };
  const opts = Array.isArray(item.options) ? item.options : null;
  const isTF =
    item.type === 'truefalse' || (!opts && (item.correctAnswer != null || item.answer != null || item.correct != null));
  if (isTF) {
    const b = toBool(item.correctAnswer ?? item.answer ?? item.correct);
    if (b === null) return { item, ok: false };
    return { item: item.correctAnswer === b ? item : { ...item, correctAnswer: b }, ok: true };
  }
  if (opts && opts.length) {
    const idx = resolveCorrectIndex(item, opts);
    if (idx === null) return { item, ok: false };
    return { item: item.correctIndex === idx ? item : { ...item, correctIndex: idx }, ok: true };
  }
  // Unclassifiable item (no options, no answer-ish field) — leave untouched.
  return { item, ok: true };
};

// Normalize a quiz array, dropping ungradeable items. Returns { quiz, dropped }.
export const normalizeQuiz = (quiz) => {
  if (!Array.isArray(quiz)) return { quiz, dropped: 0 };
  const kept = [];
  let dropped = 0;
  for (const it of quiz) {
    const { item, ok } = resolveQuizItem(it);
    if (!ok) {
      dropped++;
      continue;
    }
    kept.push(item);
  }
  return { quiz: kept, dropped };
};

// Pure, non-mutating report of how many quiz items would be dropped on import
// (so the UI can warn instead of silently importing an all-wrong deck).
export const quizImportReport = (data) => {
  if (!data || !Array.isArray(data.quiz)) return { dropped: 0, total: 0 };
  const { dropped } = normalizeQuiz(data.quiz);
  return { dropped, total: data.quiz.length };
};

// Some AI-generated tomes use `stages` instead of `steps` for lab steps, and
// carry non-canonical quiz answer keys. Normalize both at import time so the
// rest of the app can rely on canonical `steps` / `correctIndex` / `correctAnswer`.
// Idempotent — a no-op on already-canonical items and on quiz-less tomes.
export const normalizeTomeData = (data) => {
  if (!data || typeof data !== 'object') return data;
  let out = data;
  if (Array.isArray(data.labs)) {
    out = {
      ...out,
      labs: data.labs.map((lab) =>
        !lab || lab.steps || !Array.isArray(lab.stages) ? lab : { ...lab, steps: lab.stages },
      ),
    };
  }
  if (Array.isArray(data.quiz)) {
    out = { ...out, quiz: normalizeQuiz(data.quiz).quiz };
  }
  return stripLocalOnlyTomeFields(out);
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
