import { describe, expect, it, vi, beforeEach } from 'vitest'
import { create } from 'zustand'
import { createTriggerSlice } from './trigger-slice'
import type { DmTrigger } from '../../types/game-state'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

function makeStore() {
  return create<any>()((set, get, api) => ({
    ...createTriggerSlice(set, get, api)
  }))
}

function makeTrigger(overrides: Partial<DmTrigger> = {}): DmTrigger {
  return {
    id: 't1',
    name: 'Test Trigger',
    event: 'combat_start',
    condition: {},
    action: 'narrate',
    actionPayload: {},
    enabled: true,
    oneShot: false,
    firedCount: 0,
    ...overrides
  }
}

describe('trigger-slice', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
  })

  describe('initial state', () => {
    it('starts with empty triggers array', () => {
      expect(store.getState().triggers).toEqual([])
    })
  })

  describe('addTrigger', () => {
    it('adds a trigger to the array', () => {
      const t = makeTrigger({ id: 't1' })
      store.getState().addTrigger(t)
      expect(store.getState().triggers).toHaveLength(1)
      expect(store.getState().triggers[0]).toEqual(t)
    })

    it('appends multiple triggers', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1' }))
      store.getState().addTrigger(makeTrigger({ id: 't2' }))
      expect(store.getState().triggers).toHaveLength(2)
      expect(store.getState().triggers[1].id).toBe('t2')
    })

    it('preserves all trigger fields', () => {
      const t = makeTrigger({
        id: 'full',
        name: 'HP Threshold',
        event: 'hp_threshold',
        condition: { entityId: 'goblin-1', threshold: 10 },
        action: 'spawn_creature',
        actionPayload: { creatureId: 'wolf' },
        enabled: false,
        oneShot: true,
        firedCount: 3
      })
      store.getState().addTrigger(t)
      expect(store.getState().triggers[0]).toEqual(t)
    })
  })

  describe('removeTrigger', () => {
    it('removes a trigger by id', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1' }))
      store.getState().addTrigger(makeTrigger({ id: 't2' }))
      store.getState().removeTrigger('t1')
      expect(store.getState().triggers).toHaveLength(1)
      expect(store.getState().triggers[0].id).toBe('t2')
    })

    it('does nothing if id not found', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1' }))
      store.getState().removeTrigger('nonexistent')
      expect(store.getState().triggers).toHaveLength(1)
    })

    it('handles empty array without throwing', () => {
      expect(() => store.getState().removeTrigger('t1')).not.toThrow()
      expect(store.getState().triggers).toEqual([])
    })

    it('results in empty array when last trigger removed', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1' }))
      store.getState().removeTrigger('t1')
      expect(store.getState().triggers).toEqual([])
    })
  })

  describe('updateTrigger', () => {
    it('merges updates into matching trigger', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', name: 'Old' }))
      store.getState().updateTrigger('t1', { name: 'New', enabled: false })
      const t = store.getState().triggers[0]
      expect(t.name).toBe('New')
      expect(t.enabled).toBe(false)
      expect(t.id).toBe('t1')
    })

    it('does not affect other triggers', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', name: 'A' }))
      store.getState().addTrigger(makeTrigger({ id: 't2', name: 'B' }))
      store.getState().updateTrigger('t1', { name: 'Updated' })
      expect(store.getState().triggers[1].name).toBe('B')
    })

    it('does nothing if id not found', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', name: 'A' }))
      store.getState().updateTrigger('ghost', { name: 'X' })
      expect(store.getState().triggers[0].name).toBe('A')
    })

    it('handles empty updates object', () => {
      const t = makeTrigger({ id: 't1' })
      store.getState().addTrigger(t)
      store.getState().updateTrigger('t1', {})
      expect(store.getState().triggers[0]).toEqual(t)
    })

    it('can update condition and actionPayload', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1' }))
      store.getState().updateTrigger('t1', {
        condition: { entityId: 'boss', threshold: 50 },
        actionPayload: { message: 'Boss is bloodied!' }
      })
      const t = store.getState().triggers[0]
      expect(t.condition).toEqual({ entityId: 'boss', threshold: 50 })
      expect(t.actionPayload).toEqual({ message: 'Boss is bloodied!' })
    })
  })

  describe('toggleTrigger', () => {
    it('flips enabled from true to false', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', enabled: true }))
      store.getState().toggleTrigger('t1')
      expect(store.getState().triggers[0].enabled).toBe(false)
    })

    it('flips enabled from false to true', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', enabled: false }))
      store.getState().toggleTrigger('t1')
      expect(store.getState().triggers[0].enabled).toBe(true)
    })

    it('does not affect other triggers', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', enabled: true }))
      store.getState().addTrigger(makeTrigger({ id: 't2', enabled: true }))
      store.getState().toggleTrigger('t1')
      expect(store.getState().triggers[1].enabled).toBe(true)
    })

    it('double toggle returns to original state', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', enabled: true }))
      store.getState().toggleTrigger('t1')
      store.getState().toggleTrigger('t1')
      expect(store.getState().triggers[0].enabled).toBe(true)
    })

    it('does nothing if id not found', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', enabled: true }))
      store.getState().toggleTrigger('ghost')
      expect(store.getState().triggers[0].enabled).toBe(true)
    })
  })

  describe('fireTrigger', () => {
    it('increments firedCount from 0', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', firedCount: 0 }))
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[0].firedCount).toBe(1)
    })

    it('increments firedCount from existing value', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', firedCount: 5 }))
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[0].firedCount).toBe(6)
    })

    it('handles undefined firedCount (treats as 0)', () => {
      const t = makeTrigger({ id: 't1' })
      delete (t as any).firedCount
      store.getState().addTrigger(t)
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[0].firedCount).toBe(1)
    })

    it('disables oneShot trigger after firing', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', enabled: true, oneShot: true }))
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[0].enabled).toBe(false)
    })

    it('keeps non-oneShot trigger enabled after firing', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', enabled: true, oneShot: false }))
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[0].enabled).toBe(true)
    })

    it('keeps already-disabled trigger disabled after firing', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', enabled: false, oneShot: false }))
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[0].enabled).toBe(false)
    })

    it('does not affect other triggers', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', firedCount: 0 }))
      store.getState().addTrigger(makeTrigger({ id: 't2', firedCount: 0 }))
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[1].firedCount).toBe(0)
    })

    it('does nothing if id not found', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', firedCount: 0 }))
      store.getState().fireTrigger('ghost')
      expect(store.getState().triggers[0].firedCount).toBe(0)
    })

    it('can fire multiple times on non-oneShot', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', firedCount: 0, oneShot: false, enabled: true }))
      store.getState().fireTrigger('t1')
      store.getState().fireTrigger('t1')
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[0].firedCount).toBe(3)
      expect(store.getState().triggers[0].enabled).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('add then remove yields empty array', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1' }))
      store.getState().removeTrigger('t1')
      expect(store.getState().triggers).toEqual([])
    })

    it('full lifecycle: add, update, fire, remove', () => {
      store.getState().addTrigger(makeTrigger({ id: 't1', name: 'A', firedCount: 0, oneShot: false }))
      store.getState().updateTrigger('t1', { name: 'B' })
      store.getState().fireTrigger('t1')
      expect(store.getState().triggers[0].name).toBe('B')
      expect(store.getState().triggers[0].firedCount).toBe(1)
      store.getState().removeTrigger('t1')
      expect(store.getState().triggers).toEqual([])
    })
  })
})
