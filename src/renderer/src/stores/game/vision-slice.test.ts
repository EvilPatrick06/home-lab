import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('vision-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./vision-slice')
    expect(mod).toBeDefined()
  })

  it('exports createVisionSlice as a function', async () => {
    const mod = await import('./vision-slice')
    expect(typeof mod.createVisionSlice).toBe('function')
  })
})
