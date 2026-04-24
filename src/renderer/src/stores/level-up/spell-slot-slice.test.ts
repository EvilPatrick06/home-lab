import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('spell-slot-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./spell-slot-slice')
    expect(mod).toBeDefined()
  })

  it('exports createSpellSlotSlice function', async () => {
    const mod = await import('./spell-slot-slice')
    expect(mod.createSpellSlotSlice).toBeDefined()
    expect(typeof mod.createSpellSlotSlice).toBe('function')
  })

  it('createSpellSlotSlice returns expected methods', async () => {
    const { createSpellSlotSlice } = await import('./spell-slot-slice')
    const mockSet = vi.fn()
    const mockGet = vi.fn(() => ({ newSpellIds: [] })) as unknown as () => import('./types').LevelUpState
    const slice = createSpellSlotSlice(mockSet, mockGet)
    expect(typeof slice.setNewSpellIds).toBe('function')
    expect(typeof slice.toggleNewSpell).toBe('function')
    expect(typeof slice.setSpellsRequired).toBe('function')
    expect(typeof slice.setInvocationSelections).toBe('function')
    expect(typeof slice.setMetamagicSelections).toBe('function')
    expect(typeof slice.setBlessedWarriorCantrips).toBe('function')
    expect(typeof slice.setDruidicWarriorCantrips).toBe('function')
  })
})
