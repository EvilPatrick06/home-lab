import { migrateCharacter5eToRefs } from '../../shared/migrations/v4-character-refs'

// Phase 15 → flipped to 4. The original v3.0.0-release coupling was dropped (the app is in
// active testing, no installed-base compatibility to preserve), so the on-disk migrate loop now
// reaches MIGRATIONS[4] (the v3→v4 Character5e refs+state conversion). The renderer runtime shim
// (`migrateCharacter5eFromV3ToV4`) stays as a redundant safety net for the renderer-load path,
// and the main-process loader (character-storage.ts) now writes a one-time `.pre-phase-15.bak`
// snapshot the first time a save file crosses the v3→v4 boundary (see snapshot.ts).
export const CURRENT_SCHEMA_VERSION = 4

type Migration = (data: Record<string, unknown>) => Record<string, unknown>

const MIGRATIONS: Record<number, Migration> = {
  2: (data) => {
    if (!data.schemaVersion) {
      data.schemaVersion = 2
    }
    if (data.gameSystem === 'dnd5e' && !data.conditions) {
      data.conditions = []
    }
    return data
  },
  3: (data) => {
    // v2→v3: hitDiceRemaining migration removed (all data already migrated)
    return data
  },
  // Phase 15 — v3→v4 Character5e refs+state migration (DORMANT until release; see note above).
  // Delegates to the shared core so renderer (BACKUP_MIGRATIONS[4]) + main use identical logic.
  4: (data) => {
    if (data.gameSystem === 'dnd5e') {
      return migrateCharacter5eToRefs(data)
    }
    return data
  }
}

export function migrateData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data as Record<string, unknown>
  }

  let record = data as Record<string, unknown>
  let version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 1

  while (version < CURRENT_SCHEMA_VERSION) {
    const nextVersion = version + 1
    const migration = MIGRATIONS[nextVersion]
    if (migration) {
      // Capture the return value: in-place migrations (2/3) return the same record, but
      // ref-shape migrations (4) return a NEW object, so reassignment is required.
      record = migration(record) ?? record
    }
    version = nextVersion
  }

  record.schemaVersion = CURRENT_SCHEMA_VERSION
  return record
}
