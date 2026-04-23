import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('combat-log-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./combat-log-slice')
    expect(mod).toBeDefined()
  })

  it('exports createCombatLogSlice as a function', async () => {
    const mod = await import('./combat-log-slice')
    expect(typeof mod.createCombatLogSlice).toBe('function')
  })
})
