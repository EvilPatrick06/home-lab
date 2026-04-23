export const CURRENT_SCHEMA_VERSION = 3

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
  }
}

export function migrateData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data as Record<string, unknown>
  }

  const record = data as Record<string, unknown>
  let version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 1

  while (version < CURRENT_SCHEMA_VERSION) {
    const nextVersion = version + 1
    const migration = MIGRATIONS[nextVersion]
    if (migration) {
      migration(record)
    }
    version = nextVersion
  }

  record.schemaVersion = CURRENT_SCHEMA_VERSION
  return record
}
