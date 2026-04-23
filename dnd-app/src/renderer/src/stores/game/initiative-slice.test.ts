import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('game initiative-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./initiative-slice')
    expect(mod).toBeDefined()
  })

  it('exports createInitiativeSlice', async () => {
    const mod = await import('./initiative-slice')
    expect(mod.createInitiativeSlice).toBeDefined()
    expect(typeof mod.createInitiativeSlice).toBe('function')
  })
})
