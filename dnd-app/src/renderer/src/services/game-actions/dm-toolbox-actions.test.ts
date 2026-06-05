import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./broadcast-helpers', () => ({ postDmMessage: vi.fn() }))
vi.mock('./name-resolver', () => ({
  resolveTokenByLabel: vi.fn((tokens: Array<{ label: string }>, label: string) =>
    tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  )
}))
vi.stubGlobal('crypto', { randomUUID: () => 'tb-uuid-1234' })

import type { ActiveMap, DmAction, StoreAccessors } from './types'

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    activeEnvironmentalEffects: [],
    activeDiseases: [],
    activeCurses: [],
    placedTraps: [],
    addEnvironmentalEffect: vi.fn(),
    removeEnvironmentalEffect: vi.fn(),
    addDisease: vi.fn(),
    updateDisease: vi.fn(),
    removeDisease: vi.fn(),
    addCurse: vi.fn(),
    removeCurse: vi.fn(),
    addPlacedTrap: vi.fn(),
    triggerTrap: vi.fn(),
    revealTrap: vi.fn(),
    removeTrap: vi.fn(),
    ...overrides
  } as unknown as ReturnType<ReturnType<StoreAccessors['getGameStore']>['getState']>
}

const stores = {} as StoreAccessors
const map = {
  id: 'map-1',
  name: 'Test',
  tokens: [{ id: 't1', entityId: 'e1', label: 'Fighter' }]
} as unknown as ActiveMap

describe('dm-toolbox-actions', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Environmental effects (G16) ──

  describe('environmental effects', () => {
    it('adds an effect with mechanical detail', async () => {
      const { executeAddEnvironmentalEffect } = await import('./dm-toolbox-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'add_environmental_effect',
        name: 'Extreme Cold',
        mechanicalEffect: 'DC 10 CON / hour or 1 exhaustion',
        saveDC: 10,
        category: 'weather'
      }
      executeAddEnvironmentalEffect(action, gs, map, stores)
      expect(gs.addEnvironmentalEffect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Extreme Cold',
          effectId: 'extreme-cold',
          mechanicalEffect: 'DC 10 CON / hour or 1 exhaustion',
          saveDC: 10,
          category: 'weather'
        })
      )
    })

    it('removes an effect by name', async () => {
      const { executeRemoveEnvironmentalEffect } = await import('./dm-toolbox-actions')
      const gs = makeGameStore({
        activeEnvironmentalEffects: [{ id: 'env1', effectId: 'fog', name: 'Choking Fog', appliedAt: 0 }]
      })
      executeRemoveEnvironmentalEffect({ action: 'remove_environmental_effect', name: 'Choking Fog' }, gs, map, stores)
      expect(gs.removeEnvironmentalEffect).toHaveBeenCalledWith('env1')
    })

    it('throws when removing a missing effect', async () => {
      const { executeRemoveEnvironmentalEffect } = await import('./dm-toolbox-actions')
      const gs = makeGameStore()
      expect(() =>
        executeRemoveEnvironmentalEffect({ action: 'remove_environmental_effect', name: 'Nope' }, gs, map, stores)
      ).toThrow('Environmental effect not found')
    })
  })

  // ── Diseases & curses (G17) ──

  describe('diseases & curses', () => {
    it('applies a disease, resolving the target token', async () => {
      const { executeApplyDisease } = await import('./dm-toolbox-actions')
      const gs = makeGameStore()
      executeApplyDisease({ action: 'apply_disease', targetLabel: 'Fighter', name: 'Sewer Plague' }, gs, map, stores)
      expect(gs.addDisease).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sewer Plague',
          targetId: 'e1',
          targetName: 'Fighter',
          successCount: 0,
          failCount: 0
        })
      )
    })

    it('falls back to the raw label when the target token is unknown', async () => {
      const { executeApplyDisease } = await import('./dm-toolbox-actions')
      const gs = makeGameStore()
      executeApplyDisease({ action: 'apply_disease', targetLabel: 'Unknown NPC', name: 'Filth Fever' }, gs, map, stores)
      expect(gs.addDisease).toHaveBeenCalledWith(expect.objectContaining({ targetName: 'Unknown NPC' }))
    })

    it('records a disease save success (increments successCount)', async () => {
      const { executeRecordDiseaseSave } = await import('./dm-toolbox-actions')
      const gs = makeGameStore({
        activeDiseases: [
          {
            id: 'd1',
            diseaseId: 'sewer',
            name: 'Sewer Plague',
            targetId: 'e1',
            targetName: 'Fighter',
            successCount: 1,
            failCount: 0
          }
        ]
      })
      executeRecordDiseaseSave(
        { action: 'record_disease_save', targetLabel: 'Fighter', success: true },
        gs,
        map,
        stores
      )
      expect(gs.updateDisease).toHaveBeenCalledWith('d1', { successCount: 2 })
    })

    it('cures a disease by target + name', async () => {
      const { executeRemoveDisease } = await import('./dm-toolbox-actions')
      const gs = makeGameStore({
        activeDiseases: [
          {
            id: 'd1',
            diseaseId: 'x',
            name: 'Sewer Plague',
            targetId: 'e1',
            targetName: 'Fighter',
            successCount: 0,
            failCount: 0
          }
        ]
      })
      executeRemoveDisease({ action: 'remove_disease', targetLabel: 'Fighter', name: 'Sewer Plague' }, gs, map, stores)
      expect(gs.removeDisease).toHaveBeenCalledWith('d1')
    })

    it('applies + lifts a curse', async () => {
      const { executeApplyCurse, executeRemoveCurse } = await import('./dm-toolbox-actions')
      const gs = makeGameStore()
      executeApplyCurse({ action: 'apply_curse', targetLabel: 'Fighter', name: 'Bestow Curse' }, gs, map, stores)
      expect(gs.addCurse).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bestow Curse', targetName: 'Fighter' }))

      const gs2 = makeGameStore({
        activeCurses: [{ id: 'c1', curseId: 'x', name: 'Bestow Curse', targetId: 'e1', targetName: 'Fighter' }]
      })
      executeRemoveCurse({ action: 'remove_curse', targetLabel: 'Fighter' }, gs2, map, stores)
      expect(gs2.removeCurse).toHaveBeenCalledWith('c1')
    })
  })

  // ── Traps (G18) ──

  describe('traps', () => {
    it('places an armed, hidden trap', async () => {
      const { executePlaceTrap } = await import('./dm-toolbox-actions')
      const gs = makeGameStore()
      executePlaceTrap({ action: 'place_trap', name: 'Poison Dart', gridX: 4, gridY: 5 }, gs, map, stores)
      expect(gs.addPlacedTrap).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Poison Dart', gridX: 4, gridY: 5, armed: true, revealed: false })
      )
    })

    it('triggers a trap found by name', async () => {
      const { executeTriggerTrap } = await import('./dm-toolbox-actions')
      const gs = makeGameStore({
        placedTraps: [{ id: 'tr1', trapId: 'x', name: 'Poison Dart', gridX: 4, gridY: 5, armed: true, revealed: false }]
      })
      executeTriggerTrap({ action: 'trigger_trap', name: 'Poison Dart' }, gs, map, stores)
      expect(gs.triggerTrap).toHaveBeenCalledWith('tr1')
    })

    it('reveals a trap found by position', async () => {
      const { executeRevealTrap } = await import('./dm-toolbox-actions')
      const gs = makeGameStore({
        placedTraps: [{ id: 'tr1', trapId: 'x', name: 'Pit', gridX: 7, gridY: 8, armed: true, revealed: false }]
      })
      executeRevealTrap({ action: 'reveal_trap', gridX: 7, gridY: 8 }, gs, map, stores)
      expect(gs.revealTrap).toHaveBeenCalledWith('tr1')
    })

    it('throws when no selector is given (does not blindly match)', async () => {
      const { executeTriggerTrap } = await import('./dm-toolbox-actions')
      const gs = makeGameStore({
        placedTraps: [{ id: 'tr1', trapId: 'x', name: 'Pit', gridX: 7, gridY: 8, armed: true, revealed: false }]
      })
      expect(() => executeTriggerTrap({ action: 'trigger_trap' }, gs, map, stores)).toThrow('Trap not found')
    })
  })
})
