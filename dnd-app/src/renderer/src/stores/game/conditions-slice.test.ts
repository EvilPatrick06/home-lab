import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('conditions-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./conditions-slice')
    expect(mod).toBeDefined()
  })

  it('exports createConditionsSlice as a function', async () => {
    const mod = await import('./conditions-slice')
    expect(typeof mod.createConditionsSlice).toBe('function')
  })
})
