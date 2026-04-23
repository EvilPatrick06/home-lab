import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('selection-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./selection-slice')
    expect(mod).toBeDefined()
  })

  it('exports createSelectionSlice', async () => {
    const mod = await import('./selection-slice')
    expect(mod.createSelectionSlice).toBeDefined()
    expect(typeof mod.createSelectionSlice).toBe('function')
  })
})
