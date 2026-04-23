import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('fog-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./fog-slice')
    expect(mod).toBeDefined()
  })

  it('exports createFogSlice as a function', async () => {
    const mod = await import('./fog-slice')
    expect(typeof mod.createFogSlice).toBe('function')
  })
})
