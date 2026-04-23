import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('time-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./time-slice')
    expect(mod).toBeDefined()
  })

  it('exports createTimeSlice as a function', async () => {
    const mod = await import('./time-slice')
    expect(typeof mod.createTimeSlice).toBe('function')
  })
})
