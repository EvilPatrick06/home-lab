import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('core-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./core-slice')
    expect(mod).toBeDefined()
  })

  it('exports createCoreSlice as a function', async () => {
    const mod = await import('./core-slice')
    expect(typeof mod.createCoreSlice).toBe('function')
  })
})
