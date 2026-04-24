import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('ability-score-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./ability-score-slice')
    expect(mod).toBeDefined()
  })

  it('exports createAbilityScoreSlice as a function', async () => {
    const mod = await import('./ability-score-slice')
    expect(typeof mod.createAbilityScoreSlice).toBe('function')
  })
})
