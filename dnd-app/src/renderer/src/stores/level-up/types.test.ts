import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('level-up types', () => {
  it('can be imported', async () => {
    const mod = await import('./types')
    expect(mod).toBeDefined()
  })

  it('exports MULTICLASS_PREREQUISITES', async () => {
    const mod = await import('./types')
    expect(mod.MULTICLASS_PREREQUISITES).toBeDefined()
    expect(typeof mod.MULTICLASS_PREREQUISITES).toBe('object')
    expect(mod.MULTICLASS_PREREQUISITES).toHaveProperty('barbarian')
    expect(mod.MULTICLASS_PREREQUISITES).toHaveProperty('wizard')
  })

  it('exports checkMulticlassPrerequisites function', async () => {
    const mod = await import('./types')
    expect(typeof mod.checkMulticlassPrerequisites).toBe('function')
  })

  it('checkMulticlassPrerequisites returns null for unknown class', async () => {
    const { checkMulticlassPrerequisites } = await import('./types')
    const result = checkMulticlassPrerequisites('unknown', {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    })
    expect(result).toBeNull()
  })

  it('checkMulticlassPrerequisites returns error string when prereqs not met', async () => {
    const { checkMulticlassPrerequisites } = await import('./types')
    const result = checkMulticlassPrerequisites('barbarian', {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    })
    expect(result).not.toBeNull()
    expect(typeof result).toBe('string')
  })

  it('checkMulticlassPrerequisites returns null when prereqs met', async () => {
    const { checkMulticlassPrerequisites } = await import('./types')
    const result = checkMulticlassPrerequisites('barbarian', {
      strength: 13,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    })
    expect(result).toBeNull()
  })

  it('checkMulticlassPrerequisites handles any mode (fighter)', async () => {
    const { checkMulticlassPrerequisites } = await import('./types')
    // Fighter needs STR 13 OR DEX 13
    const metWithStr = checkMulticlassPrerequisites('fighter', {
      strength: 13,
      dexterity: 8,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    })
    expect(metWithStr).toBeNull()

    const metWithDex = checkMulticlassPrerequisites('fighter', {
      strength: 8,
      dexterity: 13,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    })
    expect(metWithDex).toBeNull()

    const notMet = checkMulticlassPrerequisites('fighter', {
      strength: 8,
      dexterity: 8,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    })
    expect(notMet).not.toBeNull()
  })

  it('exports initialState', async () => {
    const mod = await import('./types')
    expect(mod.initialState).toBeDefined()
    expect(mod.initialState.character).toBeNull()
    expect(mod.initialState.currentLevel).toBe(0)
    expect(mod.initialState.targetLevel).toBe(0)
    expect(mod.initialState.loading).toBe(false)
    expect(Array.isArray(mod.initialState.levelUpSlots)).toBe(true)
  })
})
