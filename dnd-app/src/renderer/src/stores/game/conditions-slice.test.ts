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

  it('clearAllConditions empties the conditions array (PHASE-09 09D)', async () => {
    const { createConditionsSlice } = await import('./conditions-slice')
    const set = vi.fn()
    const slice = createConditionsSlice(set as any, (() => ({})) as any, {} as any)
    slice.clearAllConditions()
    expect(set).toHaveBeenCalledWith({ conditions: [] })
  })
})
