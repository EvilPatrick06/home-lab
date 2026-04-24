import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('effects-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./effects-slice')
    expect(mod).toBeDefined()
  })

  it('exports createEffectsSlice as a function', async () => {
    const mod = await import('./effects-slice')
    expect(typeof mod.createEffectsSlice).toBe('function')
  })
})
