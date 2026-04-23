import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('builder types', () => {
  it('can be imported', async () => {
    const mod = await import('./types')
    expect(mod).toBeDefined()
  })

  it('exports FOUNDATION_SLOT_IDS', async () => {
    const mod = await import('./types')
    expect(mod.FOUNDATION_SLOT_IDS).toBeDefined()
    expect(Array.isArray(mod.FOUNDATION_SLOT_IDS)).toBe(true)
    expect(mod.FOUNDATION_SLOT_IDS).toContain('class')
    expect(mod.FOUNDATION_SLOT_IDS).toContain('background')
    expect(mod.FOUNDATION_SLOT_IDS).toContain('ancestry')
  })

  it('exports POINT_BUY_COSTS as a record', async () => {
    const mod = await import('./types')
    expect(mod.POINT_BUY_COSTS).toBeDefined()
    expect(typeof mod.POINT_BUY_COSTS).toBe('object')
  })

  it('exports POINT_BUY_BUDGET as a number', async () => {
    const mod = await import('./types')
    expect(typeof mod.POINT_BUY_BUDGET).toBe('number')
  })

  it('exports STANDARD_ARRAY as an array', async () => {
    const mod = await import('./types')
    expect(Array.isArray(mod.STANDARD_ARRAY)).toBe(true)
  })

  it('exports DEFAULT_SCORES with six ability scores', async () => {
    const mod = await import('./types')
    expect(mod.DEFAULT_SCORES).toBeDefined()
    expect(mod.DEFAULT_SCORES).toHaveProperty('strength')
    expect(mod.DEFAULT_SCORES).toHaveProperty('dexterity')
    expect(mod.DEFAULT_SCORES).toHaveProperty('constitution')
    expect(mod.DEFAULT_SCORES).toHaveProperty('intelligence')
    expect(mod.DEFAULT_SCORES).toHaveProperty('wisdom')
    expect(mod.DEFAULT_SCORES).toHaveProperty('charisma')
  })

  it('exports POINT_BUY_START with six ability scores', async () => {
    const mod = await import('./types')
    expect(mod.POINT_BUY_START).toBeDefined()
    expect(mod.POINT_BUY_START).toHaveProperty('strength')
    expect(mod.POINT_BUY_START).toHaveProperty('dexterity')
  })

  it('exports PRESET_ICONS', async () => {
    const mod = await import('./types')
    expect(mod.PRESET_ICONS).toBeDefined()
  })

  it('roll4d6DropLowest returns a number between 3 and 18', async () => {
    const mod = await import('./types')
    for (let i = 0; i < 20; i++) {
      const result = mod.roll4d6DropLowest()
      expect(result).toBeGreaterThanOrEqual(3)
      expect(result).toBeLessThanOrEqual(18)
    }
  })

  it('pointBuyTotal returns a number', async () => {
    const mod = await import('./types')
    const total = mod.pointBuyTotal(mod.POINT_BUY_START)
    expect(typeof total).toBe('number')
    expect(total).toBeGreaterThanOrEqual(0)
  })
})
