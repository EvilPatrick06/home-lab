import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, migrateData } from './migrations'

describe('migrations', () => {
  describe('migrateData', () => {
    it('data without schemaVersion gets migrated to current version', () => {
      const data = { name: 'Test', gameSystem: 'dnd5e', level: 1, classes: [{ name: 'Fighter', level: 1, hitDie: 10 }] }
      const result = migrateData(data)
      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    })

    it('data already at current version is unchanged', () => {
      const data = { schemaVersion: CURRENT_SCHEMA_VERSION, name: 'Test', conditions: [] }
      const result = migrateData(data)
      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
      expect(result.name).toBe('Test')
      expect(result.conditions).toEqual([])
    })

    it('v1 dnd5e character gets conditions array added', () => {
      const data = { schemaVersion: 1, gameSystem: 'dnd5e', name: 'Hero' }
      const result = migrateData(data)
      expect(result.conditions).toEqual([])
      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    })

    it('non-object data passes through unchanged', () => {
      expect(migrateData(null)).toBe(null)
      expect(migrateData([])).toEqual([])
      expect(migrateData('hello')).toBe('hello')
      expect(migrateData(42)).toBe(42)
    })
  })

  describe('CURRENT_SCHEMA_VERSION', () => {
    it('equals 3', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(3)
    })
  })
})
