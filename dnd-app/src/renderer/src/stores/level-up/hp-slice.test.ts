import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('hp-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./hp-slice')
    expect(mod).toBeDefined()
  })

  it('exports createHpSlice function', async () => {
    const mod = await import('./hp-slice')
    expect(mod.createHpSlice).toBeDefined()
    expect(typeof mod.createHpSlice).toBe('function')
  })

  it('createHpSlice returns object with setHpChoice and setHpRoll', async () => {
    const { createHpSlice } = await import('./hp-slice')
    const mockSet = vi.fn()
    const slice = createHpSlice(mockSet)
    expect(typeof slice.setHpChoice).toBe('function')
    expect(typeof slice.setHpRoll).toBe('function')
  })
})
