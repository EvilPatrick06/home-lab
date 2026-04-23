import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('save-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./save-slice')
    expect(mod).toBeDefined()
  })

  it('exports createSaveSlice as a function', async () => {
    const mod = await import('./save-slice')
    expect(typeof mod.createSaveSlice).toBe('function')
  })
})
