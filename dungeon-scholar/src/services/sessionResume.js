// Phase 30b: persistence for in-progress study sessions (Quiz/Flashcards/Exam)
// so a refresh or accidental tab close doesn't discard a long active session.
// Each "kind" gets its own localStorage key; entries are plain JSON blobs whose
// shape is decided by the consumer. A savedAt timestamp is stamped on every
// write for debug/troubleshooting.

const PREFIX = 'ds:session:';

export const SESSION_KIND = Object.freeze({
  QUIZ: 'quiz',
  FLASHCARDS: 'flashcards',
  EXAM: 'exam',
});

function isKnownKind(kind) {
  return Object.values(SESSION_KIND).includes(kind);
}

function key(kind) { return `${PREFIX}${kind}`; }

export function saveSession(kind, snapshot) {
  if (!isKnownKind(kind)) return;
  try {
    localStorage.setItem(key(kind), JSON.stringify({ ...snapshot, savedAt: Date.now() }));
  } catch {
    // Quota exceeded or storage unavailable — silent. Resume is a
    // best-effort feature; failure just means the next refresh starts fresh.
  }
}

export function loadSession(kind) {
  if (!isKnownKind(kind)) return null;
  try {
    const raw = localStorage.getItem(key(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(kind) {
  if (!isKnownKind(kind)) return;
  try { localStorage.removeItem(key(kind)); } catch { /* ignore */ }
}

export function clearAllSessions() {
  Object.values(SESSION_KIND).forEach(clearSession);
}
