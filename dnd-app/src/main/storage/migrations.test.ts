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

    it('v1 dnd5e character walks through to v4 (conditions added at v2, then converted to refs)', () => {
      const data = { schemaVersion: 1, gameSystem: 'dnd5e', name: 'Hero' }
      const result = migrateData(data)
      // v1→v2 adds `conditions: []`; v3→v4 strips every legacy inline array. An empty
      // conditions list yields no conditionRefs, so the field is simply removed.
      expect(result.conditions).toBeUndefined()
      expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    })

    it('v3 dnd5e character is ref-migrated to v4 (classes → classRefs, inline arrays stripped)', () => {
      const data = {
        schemaVersion: 3,
        gameSystem: 'dnd5e',
        name: 'Aria',
        classes: [{ name: 'Wizard', level: 3, hitDie: 6 }],
        conditions: []
      }
      const result = migrateData(data)
      expect(result.schemaVersion).toBe(4)
      // v3 inline arrays are gone…
      expect(result.classes).toBeUndefined()
      expect(result.conditions).toBeUndefined()
      // …replaced by the canonical v4 ref shape.
      const classRefs = result.classRefs as Array<Record<string, unknown>>
      expect(Array.isArray(classRefs)).toBe(true)
      expect(classRefs).toHaveLength(1)
      expect((classRefs[0].ref as Record<string, unknown>).entryId).toBe('wizard')
      expect(classRefs[0].level).toBe(3)
    })

    it('non-object data passes through unchanged', () => {
      expect(migrateData(null)).toBe(null)
      expect(migrateData([])).toEqual([])
      expect(migrateData('hello')).toBe('hello')
      expect(migrateData(42)).toBe(42)
    })
  })

  describe('CURRENT_SCHEMA_VERSION', () => {
    it('equals 4', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(4)
    })
  })
})
