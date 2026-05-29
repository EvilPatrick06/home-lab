import { describe, expect, it } from 'vitest'
import { type Encounter, migrateEncounter } from './encounter'

describe('migrateEncounter (Phase 26d)', () => {
  it('wraps a flat monsters list into a single Wave 1', () => {
    const legacy = {
      id: 'e1',
      name: 'Ambush',
      description: '',
      monsters: [{ monsterId: 'goblin', count: 3 }],
      difficulty: 'moderate',
      levelRange: { min: 1, max: 3 },
      totalXP: 150
    }
    const migrated = migrateEncounter(legacy)
    expect(migrated.waves).toHaveLength(1)
    expect(migrated.waves?.[0]).toMatchObject({ id: 'wave-1', name: 'Wave 1' })
    expect(migrated.waves?.[0].monsters).toEqual([{ monsterId: 'goblin', count: 3 }])
    // Flat list preserved.
    expect(migrated.monsters).toEqual([{ monsterId: 'goblin', count: 3 }])
  })

  it('keeps existing waves and rebuilds the flat union when monsters is empty', () => {
    const withWaves = {
      id: 'e2',
      name: 'Siege',
      description: '',
      monsters: [],
      waves: [
        { id: 'w1', name: 'Wave 1', monsters: [{ monsterId: 'orc', count: 2 }] },
        { id: 'w2', name: 'Wave 2', monsters: [{ monsterId: 'ogre', count: 1 }] }
      ],
      difficulty: 'hard',
      levelRange: { min: 3, max: 5 },
      totalXP: 1000
    } as unknown as Encounter
    const migrated = migrateEncounter(withWaves as unknown as Record<string, unknown>)
    expect(migrated.waves).toHaveLength(2)
    expect(migrated.monsters).toEqual([
      { monsterId: 'orc', count: 2 },
      { monsterId: 'ogre', count: 1 }
    ])
  })
})
