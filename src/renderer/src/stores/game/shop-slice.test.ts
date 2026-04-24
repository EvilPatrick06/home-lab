import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('shop-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./shop-slice')
    expect(mod).toBeDefined()
  })

  it('exports createShopSlice as a function', async () => {
    const mod = await import('./shop-slice')
    expect(typeof mod.createShopSlice).toBe('function')
  })
})
