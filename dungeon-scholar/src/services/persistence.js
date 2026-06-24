import { migrateTutorialIndex } from '../game/tutorial.js';

export const STORAGE_KEY = 'dungeon-scholar:save:v1';
export const SYNC_META_KEY = 'dungeon-scholar:sync:v1';
export const CURRENT_SCHEMA_VER = 1;

// Saves embed `__schemaVer` so a future load can run the right migrations.
// Pre-existing saves on disk that lack the marker are treated as schemaVer 0
// — see `loadFromLocalStorage` and `migrateIfNeeded`.

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Pull the schema marker out of the payload so the rest of the app
    // never sees it. Default to 0 so legacy saves trigger the v0→v1
    // tutorial-index migration (otherwise it's a silent no-op).
    const schemaVer = typeof parsed.__schemaVer === 'number' ? parsed.__schemaVer : 0;
    const { __schemaVer, ...state } = parsed; // eslint-disable-line no-unused-vars
    return { state, schemaVer };
  } catch {
    return null;
  }
}

// M10 (17F): browsers throw differing QuotaExceededError variants — match by
// DOMException name OR legacy numeric code so we can tell "storage full /
// unavailable" (private mode) from an ordinary error.
export function isQuotaExceededError(err) {
  return (
    err instanceof DOMException &&
    (err.code === 22 || // most browsers
      err.code === 1014 || // legacy Firefox
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

export function saveToLocalStorage(state) {
  try {
    const payload = { ...(state || {}), __schemaVer: CURRENT_SCHEMA_VER };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    // Quota exceeded or storage unavailable (private mode). Cloud / Export
    // still work — callers decide whether to surface this (M10 / 17F).
    return { ok: false, quota: isQuotaExceededError(err) };
  }
}

export function hasMeaningfulData(state) {
  if (!state) return false;
  if ((state.level ?? 1) > 1) return true;
  if ((state.totalXp ?? 0) > 0) return true;
  if (Array.isArray(state.library) && state.library.length > 0) return true;
  return false;
}

// Canonical content hash of a player-state blob. Used by usePlayerState's
// sign-in branch to detect "no real divergence" cases — when both sides
// already match byte-for-byte, the MergeChooser ("Two Journals Discovered")
// is just noise and forces an arbitrary pick over identical state.
//
// Phase 32a fix for QA #1 regression: Supabase stores `data` as JSONB, which
// reorders object keys based on internal storage rules. A naive
// JSON.stringify reflects JS insertion order, so local (insertion-ordered)
// and cloud (JSONB-reordered) of the SAME content produce different strings.
// We use a stable, depth-first stringifier that sorts keys at every level so
// the hash depends only on content, not key order.
function stableStringify(value) {
  if (value === undefined) return undefined;
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((v) => {
      const s = stableStringify(v);
      return s === undefined ? 'null' : s;
    });
    return '[' + items.join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (const k of keys) {
      const s = stableStringify(value[k]);
      if (s === undefined) continue;
      parts.push(JSON.stringify(k) + ':' + s);
    }
    return '{' + parts.join(',') + '}';
  }
  return undefined;
}

export function hashState(state) {
  if (!state || typeof state !== 'object') return '';
  try {
    return stableStringify(state) || '';
  } catch {
    return '';
  }
}

// Phase 33a fix for QA P1: even with stable key sorting, hashState diverges
// on internal noise that the user can't see — mistakeVault.addedAt timestamps
// from independent device backfills, chatHistory ordering, lastOpened, etc.
// `semanticHashState` fingerprints ONLY user-observable counters and per-tome
// progress totals, so the MergeChooser fires only on real divergence.
//
// Use this for the chooser short-circuit; use full hashState for cases where
// we genuinely need bit-exact equivalence.
export function semanticHashState(state) {
  if (!state || typeof state !== 'object') return '';
  try {
    const library = Array.isArray(state.library) ? state.library : [];
    const fingerprint = {
      level: state.level ?? 1,
      totalXp: state.totalXp ?? 0,
      totalCorrect: state.totalCorrect ?? 0,
      totalAnswered: state.totalAnswered ?? 0,
      gold: state.gold ?? 0,
      longestStreak: state.longestStreak ?? 0,
      tutorialStarted: !!state.tutorialStarted,
      tutorialCompleted: !!state.tutorialCompleted,
      tutorialStepIndex: state.tutorialStepIndex ?? 0,
      libraryCount: library.length,
      activeTomeId: state.activeTomeId ?? null,
      achievementsCount: Array.isArray(state.achievements) ? state.achievements.length : 0,
      unlockedTitlesCount: Array.isArray(state.unlockedTitles) ? state.unlockedTitles.length : 0,
      tomes: library
        .map((t) => ({
          id: t?.id ?? '',
          cardsReviewed: t?.progress?.cardsReviewed ?? 0,
          quizAnswered: t?.progress?.quizAnswered ?? 0,
          labsAttempted: t?.progress?.labsAttempted ?? 0,
          labsCompleted: t?.progress?.labsCompleted ?? 0,
          runsCompleted: t?.progress?.runsCompleted ?? 0,
          bossesDefeated: t?.progress?.bossesDefeated ?? 0,
          oracleMessages: t?.progress?.oracleMessages ?? 0,
          mistakeCount: Array.isArray(t?.progress?.mistakeVault) ? t.progress.mistakeVault.length : 0,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
    return stableStringify(fingerprint) || '';
  } catch {
    return '';
  }
}

export function migrateIfNeeded(state, schemaVer) {
  if (!state) return state;
  let next = state;
  // schemaVer < 1 → tutorial overhaul: pre-overhaul saves used a different
  // 8-step ordering. Remap the savedIndex to the current TUTORIAL_STEPS
  // layout so the resumed tutorial picks up at the right step.
  //
  // localStorage saves now carry __schemaVer in the payload (since
  // commit "persist schemaVer in localStorage"). Saves written before
  // that fix are treated as schemaVer 0 by loadFromLocalStorage, so
  // they hit this case once on next load.
  if (schemaVer < 1 && typeof next.tutorialStepIndex === 'number') {
    next = { ...next, tutorialStepIndex: migrateTutorialIndex(next.tutorialStepIndex) };
  }
  return next;
}

// Sync metadata (separate from playerState — these are about the device's
// relationship with the cloud, not data that should travel between devices).
//
// lastSyncedAt: ISO string of cloud's updated_at at the last successful sync.
//               null means we have never synced this device with this account.
// dirty: true if the user has made any changes since the last successful sync.

const DEFAULT_SYNC_META = { lastSyncedAt: null, dirty: false };

export function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { ...DEFAULT_SYNC_META };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SYNC_META, ...parsed };
  } catch {
    return { ...DEFAULT_SYNC_META };
  }
}

export function saveSyncMeta(meta) {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

export function clearSyncMeta() {
  try {
    localStorage.removeItem(SYNC_META_KEY);
  } catch {
    // ignore
  }
}

// S12: portable save export/import (offline backup file). The in-app quota
// error copy promises "export thy journal" — these provide it.
export function exportSaveText(state) {
  return JSON.stringify(
    { app: 'dungeon-scholar', schema_ver: CURRENT_SCHEMA_VER, exportedAt: new Date().toISOString(), state },
    null,
    2,
  );
}

export function parseImportedSave(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  // Accept both the wrapped export shape and a bare state object.
  const state = parsed && parsed.app === 'dungeon-scholar' && parsed.state ? parsed.state : parsed;
  if (!state || typeof state !== 'object' || !Array.isArray(state.library)) {
    return { ok: false, error: 'This file is not a Dungeon Scholar journal.' };
  }
  const ver =
    parsed && typeof parsed.schema_ver === 'number' ? parsed.schema_ver : (state.schemaVer ?? CURRENT_SCHEMA_VER);
  return { ok: true, state: migrateIfNeeded(state, ver) };
}

// ---------------------------------------------------------------------------
// I1: local autosave-snapshot ring buffer.
//
// Persistence keeps a single live save under STORAGE_KEY. Before this, the only
// recovery path was the manual "Export journal" backup or cloud sync — a user
// who cleared browsing data, hit a corrupt write, or fat-fingered "Reset
// progress" lost everything with no local undo. This keeps a small rotating
// buffer of recent good saves (newest-first, pruned to a count + total-byte
// cap so it respects the localStorage quota) so the app can offer "restore a
// recent snapshot" and make a reset undoable for one step — all locally, no
// cloud account required.
export const SNAPSHOT_PREFIX = 'dungeon-scholar:save:snap:';
export const SNAPSHOT_MAX = 5;
export const SNAPSHOT_MAX_BYTES = 1_500_000; // ~1.5 MB total across snapshots
export const SNAPSHOT_MIN_INTERVAL_MS = 3 * 60 * 1000; // throttle ordinary saves

let _lastSnapshotAt = 0;

// Newest-first list of { key, ts, reason, bytes } for every stored snapshot.
export function listSnapshots() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(SNAPSHOT_PREFIX)) continue;
      const tsFromKey = Number(key.slice(SNAPSHOT_PREFIX.length));
      let reason = null;
      let bytes = 0;
      try {
        const raw = localStorage.getItem(key);
        bytes = raw ? raw.length : 0;
        const parsed = raw ? JSON.parse(raw) : null;
        reason = parsed && parsed.reason ? parsed.reason : null;
      } catch {
        /* leave defaults */
      }
      out.push({ key, ts: Number.isFinite(tsFromKey) ? tsFromKey : 0, reason, bytes });
    }
  } catch {
    /* localStorage unavailable */
  }
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

// Keep at most `max` newest snapshots and stay under `maxBytes` total.
export function pruneSnapshots(max = SNAPSHOT_MAX, maxBytes = SNAPSHOT_MAX_BYTES) {
  try {
    const snaps = listSnapshots(); // newest-first
    let kept = 0;
    let bytes = 0;
    for (const s of snaps) {
      kept += 1;
      bytes += s.bytes;
      if (kept > max || bytes > maxBytes) {
        try {
          localStorage.removeItem(s.key);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

// Write a snapshot of `state`. Throttled to SNAPSHOT_MIN_INTERVAL_MS for
// ordinary autosaves; pass { force: true } (e.g. pre-reset) to bypass the
// throttle. Blank/empty states are skipped unless forced. On quota errors it
// prunes harder and retries once.
export function writeSnapshot(state, opts = {}) {
  if (!state || typeof state !== 'object') return { ok: false };
  const force = !!opts.force;
  const now = Date.now();
  if (!force && now - _lastSnapshotAt < SNAPSHOT_MIN_INTERVAL_MS) return { ok: false, skipped: true };
  if (!force && !hasMeaningfulData(state)) return { ok: false, skipped: true };
  // Ensure a unique key even for multiple writes within the same ms.
  let key = SNAPSHOT_PREFIX + now;
  for (let n = 1; localStorage.getItem(key) != null; n++) key = SNAPSHOT_PREFIX + now + '.' + n;
  const payload = JSON.stringify({ ts: now, reason: opts.reason || null, __schemaVer: CURRENT_SCHEMA_VER, state });
  try {
    localStorage.setItem(key, payload);
  } catch (err) {
    pruneSnapshots(2, Math.floor(SNAPSHOT_MAX_BYTES / 2));
    try {
      localStorage.setItem(key, payload);
    } catch {
      return { ok: false, quota: isQuotaExceededError(err) };
    }
  }
  _lastSnapshotAt = now;
  pruneSnapshots();
  return { ok: true, key };
}

// Read a snapshot back as a migrated player-state blob (or null if missing).
export function restoreSnapshot(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ver = typeof parsed.__schemaVer === 'number' ? parsed.__schemaVer : 0;
    const state = parsed && parsed.state;
    if (!state || typeof state !== 'object') return null;
    return migrateIfNeeded(state, ver);
  } catch {
    return null;
  }
}

// Test seam: reset the throttle clock so unit tests can write back-to-back.
export function _resetSnapshotThrottleForTests() {
  _lastSnapshotAt = 0;
}
