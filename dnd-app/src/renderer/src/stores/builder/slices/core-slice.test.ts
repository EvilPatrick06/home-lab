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

describe('core-slice setClassLevelChoice — spell-selection cap recompute', () => {
  it('refreshes maxCantrips / maxPreparedSpells instead of leaving them stale', async () => {
    const { createCoreSlice } = await import('./core-slice')
    const { getCantripsKnown, getPreparedSpellMax } = await import('../../../services/character/spell-data')

    // biome-ignore lint/suspicious/noExplicitAny: minimal zustand slice harness for a unit test
    const state: any = {}
    // biome-ignore lint/suspicious/noExplicitAny: see above
    const set = (partial: any) => Object.assign(state, typeof partial === 'function' ? partial(state) : partial)
    const get = () => state
    // biome-ignore lint/suspicious/noExplicitAny: store arg is unused by the slice under test
    Object.assign(state, createCoreSlice(set as any, get as any, {} as any))

    state.gameSystem = 'dnd5e'
    state.buildSlots = [{ id: 'class', category: 'class', selectedId: 'wizard', selectedName: 'Wizard' }]
    state.targetLevel = 4
    state.classLevelChoices = {}
    // Stale caps (as if frozen at level 1) — the bug left these untouched.
    state.maxCantrips = 0
    state.maxPreparedSpells = 0

    state.setClassLevelChoice(2, 'wizard')

    expect(state.maxCantrips).toBe(getCantripsKnown('wizard', 4))
    expect(state.maxPreparedSpells).toBe(getPreparedSpellMax('wizard', 4) ?? 0)
    expect(state.maxCantrips).toBeGreaterThan(0)
  })
})
