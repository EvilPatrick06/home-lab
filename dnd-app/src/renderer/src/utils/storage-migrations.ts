import { SETTINGS_KEYS } from '../constants/settings-keys'

/**
 * WEB-STORE-1 — one-time migration of un-namespaced VTT localStorage keys to the
 * `dnd-vtt-` prefix. The web build shares the `bmo.mybmoai.work` origin with
 * other BMO apps, so a bare `library-recent` / `lobby-chat-<id>` /
 * `lobby-dice-colors` key risks colliding with (or being hard to distinguish
 * from) unrelated keys. This copies each legacy key's value to its new
 * namespaced key and removes the legacy one, so existing recents / chat history
 * / dice colors survive the rename without data loss.
 *
 * Read-side, idempotent, best-effort: a missing legacy key is skipped, an
 * already-migrated new key is never overwritten, and any storage error is
 * swallowed (the feature degrades to "starts empty", never throws at startup).
 * Scope is the QA-flagged set; other un-prefixed keys are logged for a later
 * sweep (see SUGGESTIONS-LOG-DNDAPP).
 */

// Exact legacy key → new key.
const STATIC_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['library-recent', SETTINGS_KEYS.LIBRARY_RECENT],
  ['lobby-dice-colors', SETTINGS_KEYS.LOBBY_DICE_COLORS]
]

// Legacy dynamic prefix → new dynamic prefix (per-campaign suffix preserved).
const PREFIX_RENAMES: ReadonlyArray<readonly [string, string]> = [['lobby-chat-', 'dnd-vtt-lobby-chat-']]

function migrateOne(store: Storage, from: string, to: string): void {
  if (from === to) return
  const val = store.getItem(from)
  if (val === null) return
  // Never clobber a value already written under the new key.
  if (store.getItem(to) === null) store.setItem(to, val)
  store.removeItem(from)
}

export function migrateLegacyStorageKeys(store: Storage = localStorage): void {
  try {
    for (const [from, to] of STATIC_RENAMES) migrateOne(store, from, to)
    // Snapshot keys first — we mutate the store inside the loop.
    const keys: string[] = []
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k !== null) keys.push(k)
    }
    for (const k of keys) {
      for (const [oldPrefix, newPrefix] of PREFIX_RENAMES) {
        if (k.startsWith(oldPrefix) && !k.startsWith(newPrefix)) {
          migrateOne(store, k, newPrefix + k.slice(oldPrefix.length))
        }
      }
    }
  } catch {
    /* best-effort — storage unavailable / quota; never block startup */
  }
}
