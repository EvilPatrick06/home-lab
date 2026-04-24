import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('timer-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./timer-slice')
    expect(mod).toBeDefined()
  })

  it('exports createTimerSlice as a function', async () => {
    const mod = await import('./timer-slice')
    expect(typeof mod.createTimerSlice).toBe('function')
  })
})
