import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all stores before importing the module under test
vi.mock('../../stores/useGameStore', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      round: 1,
      initiative: null,
      turnStates: {},
      maps: [],
      activeMapId: null,
      addCombatLogEntry: vi.fn(),
      updateToken: vi.fn(),
      addCondition: vi.fn(),
      setConcentrating: vi.fn(),
      updateInitiativeEntry: vi.fn()
    }))
  }
}))

vi.mock('../../stores/useLobbyStore', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      addChatMessage: vi.fn(),
      players: []
    }))
  }
}))

vi.mock('../../stores/useNetworkStore', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({
      sendMessage: vi.fn(),
      localPeerId: 'local'
    }))
  }
}))

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

import {
  canCastAsRitual,
  deathSaveDamageAtZero,
  expendSpellSlot,
  getCantripDiceCount,
  resolveConcentrationCheck,
  resolveDeathSave,
  type SpellSlotState,
  scaleCantrip
} from './combat-resolver'

describe('combat-resolver', () => {
  describe('expendSpellSlot', () => {
    const baseSlots: SpellSlotState = {
      spellSlotLevels: {
        1: { current: 4, max: 4 },
        2: { current: 3, max: 3 },
        3: { current: 2, max: 2 }
      }
    }

    it('should spend a slot successfully', () => {
      const result = expendSpellSlot(baseSlots, 1)
      expect(result.success).toBe(true)
      expect(result.updatedSlots.spellSlotLevels[1].current).toBe(3)
    })

    it('should fail when no slots remain', () => {
      const emptySlots: SpellSlotState = {
        spellSlotLevels: {
          1: { current: 0, max: 4 }
        }
      }
      const result = expendSpellSlot(emptySlots, 1)
      expect(result.success).toBe(false)
    })

    it('should not spend a slot for cantrips (level 0)', () => {
      const result = expendSpellSlot(baseSlots, 0)
      expect(result.success).toBe(true)
      expect(result.updatedSlots.spellSlotLevels[1].current).toBe(4) // unchanged
    })

    it('should spend pact magic slots when requested', () => {
      const pactSlots: SpellSlotState = {
        spellSlotLevels: { 1: { current: 4, max: 4 } },
        pactMagicSlotLevels: { 3: { current: 2, max: 2 } }
      }
      const result = expendSpellSlot(pactSlots, 3, true)
      expect(result.success).toBe(true)
      expect(result.updatedSlots.pactMagicSlotLevels![3].current).toBe(1)
    })

    it('should fail when slot level does not exist', () => {
      const result = expendSpellSlot(baseSlots, 9)
      expect(result.success).toBe(false)
    })
  })

  describe('canCastAsRitual', () => {
    it('should allow ritual casting for ritual spells with ritual caster', () => {
      expect(canCastAsRitual(1, true, true)).toBe(true)
    })

    it('should not allow ritual casting for non-ritual spells', () => {
      expect(canCastAsRitual(1, false, true)).toBe(false)
    })

    it('should not allow ritual casting without ritual caster ability', () => {
      expect(canCastAsRitual(1, true, false)).toBe(false)
    })

    it('should not allow ritual casting for cantrips', () => {
      expect(canCastAsRitual(0, true, true)).toBe(false)
    })
  })

  describe('getCantripDiceCount', () => {
    it('should return 1 die for levels 1-4', () => {
      expect(getCantripDiceCount(1)).toBe(1)
      expect(getCantripDiceCount(4)).toBe(1)
    })

    it('should return 2 dice for levels 5-10', () => {
      expect(getCantripDiceCount(5)).toBe(2)
      expect(getCantripDiceCount(10)).toBe(2)
    })

    it('should return 3 dice for levels 11-16', () => {
      expect(getCantripDiceCount(11)).toBe(3)
      expect(getCantripDiceCount(16)).toBe(3)
    })

    it('should return 4 dice for levels 17-20', () => {
      expect(getCantripDiceCount(17)).toBe(4)
      expect(getCantripDiceCount(20)).toBe(4)
    })
  })

  describe('scaleCantrip', () => {
    it('should scale 1d10 to 2d10 at level 5', () => {
      expect(scaleCantrip('1d10', 5)).toBe('2d10')
    })

    it('should scale 1d8+3 at level 11', () => {
      expect(scaleCantrip('1d8+3', 11)).toBe('3d8+3')
    })

    it('should scale 1d12 at level 17', () => {
      expect(scaleCantrip('1d12', 17)).toBe('4d12')
    })

    it('should keep formula unchanged at level 1', () => {
      expect(scaleCantrip('1d10', 1)).toBe('1d10')
    })
  })

  describe('resolveDeathSave', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('should track successes and failures', () => {
      const result = resolveDeathSave('entity-1', 'TestChar', { successes: 0, failures: 0 })
      // Result depends on random roll, so just verify structure
      expect(result).toHaveProperty('roll')
      expect(result).toHaveProperty('successes')
      expect(result).toHaveProperty('failures')
      expect(result).toHaveProperty('outcome')
      expect(result).toHaveProperty('summary')
      expect(typeof result.successes).toBe('number')
      expect(typeof result.failures).toBe('number')
    })

    it('should have correct outcome types', () => {
      const result = resolveDeathSave('entity-1', 'TestChar', { successes: 2, failures: 2 })
      expect(['continue', 'stabilized', 'dead', 'revived']).toContain(result.outcome)
    })
  })

  describe('deathSaveDamageAtZero', () => {
    it('should add 1 failure for non-critical damage', () => {
      const result = deathSaveDamageAtZero('entity-1', 'TestChar', { successes: 0, failures: 0 }, 5, false, 20)
      expect(result.failures).toBe(1)
    })

    it('should add 2 failures for critical damage', () => {
      const result = deathSaveDamageAtZero('entity-1', 'TestChar', { successes: 0, failures: 0 }, 5, true, 20)
      expect(result.failures).toBe(2)
    })

    it('should cause instant death on massive damage', () => {
      const result = deathSaveDamageAtZero('entity-1', 'TestChar', { successes: 0, failures: 0 }, 25, false, 20)
      expect(result.outcome).toBe('dead')
      expect(result.failures).toBe(3)
    })

    it('should cause death when failures reach 3', () => {
      const result = deathSaveDamageAtZero('entity-1', 'TestChar', { successes: 0, failures: 2 }, 5, false, 20)
      expect(result.outcome).toBe('dead')
    })
  })

  describe('resolveConcentrationCheck', () => {
    it('should have DC of at least 10', () => {
      const result = resolveConcentrationCheck('entity-1', 'TestChar', 5, 5)
      expect(result.dc).toBe(10) // max(10, floor(5/2)) = 10
    })

    it('should scale DC with higher damage', () => {
      const result = resolveConcentrationCheck('entity-1', 'TestChar', 30, 5)
      expect(result.dc).toBe(15) // max(10, floor(30/2)) = 15
    })

    it('should return maintained boolean', () => {
      const result = resolveConcentrationCheck('entity-1', 'TestChar', 10, 5)
      expect(typeof result.maintained).toBe('boolean')
    })
  })
})
