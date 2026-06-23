import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { ActiveSpellEffect } from '../../types/dm-toolbox'
import { createEffectsSlice } from './effects-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('effects-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./effects-slice')
    expect(mod).toBeDefined()
  })

  it('exports createEffectsSlice as a function', async () => {
    const mod = await import('./effects-slice')
    expect(typeof mod.createEffectsSlice).toBe('function')
  })

  // --- Spell effects (P6.10 / G11) ---

  describe('spell effects', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function createTestStore() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return create<any>()((set: any, get: any, api: any) => ({
        round: 1,
        ...createEffectsSlice(set, get, api)
      }))
    }

    function makeEffect(overrides: Partial<ActiveSpellEffect> = {}): ActiveSpellEffect {
      return { id: 's1', name: 'Spirit Guardians', caster: 'Cleric', startedRound: 1, ...overrides }
    }

    let store: ReturnType<typeof createTestStore>
    beforeEach(() => {
      store = createTestStore()
    })

    it('starts with an empty activeSpellEffects array', () => {
      expect(store.getState().activeSpellEffects).toEqual([])
    })

    it('addSpellEffect appends an effect', () => {
      store.getState().addSpellEffect(makeEffect())
      expect(store.getState().activeSpellEffects).toHaveLength(1)
      expect(store.getState().activeSpellEffects[0].name).toBe('Spirit Guardians')
    })

    it('updateSpellEffect patches only the matching effect', () => {
      store.getState().addSpellEffect(makeEffect({ id: 's1' }))
      store.getState().addSpellEffect(makeEffect({ id: 's2', name: 'Entangle' }))
      store.getState().updateSpellEffect('s1', { duration: 10 })
      const effects = store.getState().activeSpellEffects
      expect(effects.find((e: ActiveSpellEffect) => e.id === 's1').duration).toBe(10)
      expect(effects.find((e: ActiveSpellEffect) => e.id === 's2').duration).toBeUndefined()
    })

    it('removeSpellEffect drops by id', () => {
      store.getState().addSpellEffect(makeEffect({ id: 's1' }))
      store.getState().addSpellEffect(makeEffect({ id: 's2' }))
      store.getState().removeSpellEffect('s1')
      expect(store.getState().activeSpellEffects).toHaveLength(1)
      expect(store.getState().activeSpellEffects[0].id).toBe('s2')
    })

    it('removeSpellEffect is a no-op for an unknown id', () => {
      store.getState().addSpellEffect(makeEffect({ id: 's1' }))
      store.getState().removeSpellEffect('nope')
      expect(store.getState().activeSpellEffects).toHaveLength(1)
    })
  })

  // --- Bulk clear (PHASE-09 09D) ---

  describe('clearAllEffects', () => {
    function createTestStore() {
      return create<any>()((set: any, get: any, api: any) => ({
        round: 1,
        ...createEffectsSlice(set, get, api)
      }))
    }

    it('empties every active-effect collection but keeps placed traps', () => {
      const store = createTestStore()
      const s = store.getState()
      s.addCustomEffect({ id: 'c1', targetEntityId: 'e1' } as any)
      s.addDisease({ id: 'd1' } as any)
      s.addCurse({ id: 'cu1' } as any)
      s.addEnvironmentalEffect({ id: 'env1' } as any)
      s.addSpellEffect({ id: 'sp1', name: 'Bless', caster: 'X', startedRound: 1 } as any)
      s.addPlacedTrap({ id: 't1', armed: true } as any)

      store.getState().clearAllEffects()

      const after = store.getState()
      expect(after.customEffects).toEqual([])
      expect(after.activeDiseases).toEqual([])
      expect(after.activeCurses).toEqual([])
      expect(after.activeEnvironmentalEffects).toEqual([])
      expect(after.activeSpellEffects).toEqual([])
      // traps are placement, not an "active effect" — left intact
      expect(after.placedTraps).toHaveLength(1)
    })
  })
})
