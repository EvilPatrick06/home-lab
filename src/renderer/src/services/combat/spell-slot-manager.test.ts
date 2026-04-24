import { describe, expect, it } from 'vitest'
import {
  canCastAsRitual,
  expendSpellSlot,
  getCantripDiceCount,
  type SpellSlotState,
  scaleCantrip
} from './spell-slot-manager'

// ─── Helpers ────────────────────────────────────────────────────

function makeSlotState(overrides: Partial<SpellSlotState> = {}): SpellSlotState {
  return {
    spellSlotLevels: {
      1: { current: 4, max: 4 },
      2: { current: 3, max: 3 },
      3: { current: 2, max: 2 }
    },
    ...overrides
  }
}

// ─── expendSpellSlot ────────────────────────────────────────────

describe('expendSpellSlot', () => {
  it('cantrips (level 0) always succeed and do not consume slots', () => {
    const slots = makeSlotState()
    const result = expendSpellSlot(slots, 0)
    expect(result.success).toBe(true)
    expect(result.summary).toContain('Cantrip')
    // Slots unchanged
    expect(result.updatedSlots.spellSlotLevels[1].current).toBe(4)
  })

  it('decrements the correct spell slot level', () => {
    const slots = makeSlotState()
    const result = expendSpellSlot(slots, 2)
    expect(result.success).toBe(true)
    expect(result.updatedSlots.spellSlotLevels[2].current).toBe(2)
    expect(result.updatedSlots.spellSlotLevels[2].max).toBe(3)
  })

  it('does not mutate the original state', () => {
    const slots = makeSlotState()
    const original1stLevel = slots.spellSlotLevels[1].current
    expendSpellSlot(slots, 1)
    expect(slots.spellSlotLevels[1].current).toBe(original1stLevel)
  })

  it('fails when no slots remain at the requested level', () => {
    const slots = makeSlotState({
      spellSlotLevels: {
        1: { current: 0, max: 4 },
        2: { current: 3, max: 3 }
      }
    })
    const result = expendSpellSlot(slots, 1)
    expect(result.success).toBe(false)
    expect(result.summary).toContain('No level 1')
    expect(result.updatedSlots.spellSlotLevels[1].current).toBe(0)
  })

  it('fails when the requested level does not exist', () => {
    const slots = makeSlotState({
      spellSlotLevels: {
        1: { current: 4, max: 4 }
      }
    })
    const result = expendSpellSlot(slots, 5)
    expect(result.success).toBe(false)
  })

  it('summary shows remaining count after expenditure', () => {
    const slots = makeSlotState()
    const result = expendSpellSlot(slots, 1)
    expect(result.summary).toContain('3/4')
  })

  it('can expend down to zero', () => {
    const slots = makeSlotState({
      spellSlotLevels: {
        1: { current: 1, max: 4 }
      }
    })
    const result = expendSpellSlot(slots, 1)
    expect(result.success).toBe(true)
    expect(result.updatedSlots.spellSlotLevels[1].current).toBe(0)
    expect(result.summary).toContain('0/4')
  })

  it('preserves other slot levels when expending one', () => {
    const slots = makeSlotState()
    const result = expendSpellSlot(slots, 1)
    expect(result.updatedSlots.spellSlotLevels[2].current).toBe(3)
    expect(result.updatedSlots.spellSlotLevels[3].current).toBe(2)
  })

  describe('pact magic slots', () => {
    it('expends pact magic slot when usePactSlot is true', () => {
      const slots: SpellSlotState = {
        spellSlotLevels: { 1: { current: 4, max: 4 } },
        pactMagicSlotLevels: { 3: { current: 2, max: 2 } }
      }
      const result = expendSpellSlot(slots, 3, true)
      expect(result.success).toBe(true)
      expect(result.updatedSlots.pactMagicSlotLevels![3].current).toBe(1)
      expect(result.summary).toContain('pact magic')
    })

    it('fails when pact magic pool does not exist', () => {
      const slots: SpellSlotState = {
        spellSlotLevels: { 1: { current: 4, max: 4 } }
      }
      const result = expendSpellSlot(slots, 3, true)
      expect(result.success).toBe(false)
      expect(result.summary).toContain('pact magic')
    })

    it('fails when no pact magic slots remain', () => {
      const slots: SpellSlotState = {
        spellSlotLevels: { 1: { current: 4, max: 4 } },
        pactMagicSlotLevels: { 3: { current: 0, max: 2 } }
      }
      const result = expendSpellSlot(slots, 3, true)
      expect(result.success).toBe(false)
      expect(result.summary).toContain('pact magic')
    })

    it('does not affect regular spell slots when using pact magic', () => {
      const slots: SpellSlotState = {
        spellSlotLevels: { 3: { current: 2, max: 2 } },
        pactMagicSlotLevels: { 3: { current: 2, max: 2 } }
      }
      const result = expendSpellSlot(slots, 3, true)
      expect(result.updatedSlots.spellSlotLevels[3].current).toBe(2)
      expect(result.updatedSlots.pactMagicSlotLevels![3].current).toBe(1)
    })
  })
})

// ─── canCastAsRitual ────────────────────────────────────────────

describe('canCastAsRitual', () => {
  it('returns true for a ritual spell when caster has ritual casting', () => {
    expect(canCastAsRitual(1, true, true)).toBe(true)
  })

  it('returns false for a non-ritual spell', () => {
    expect(canCastAsRitual(1, false, true)).toBe(false)
  })

  it('returns false when caster lacks ritual casting feature', () => {
    expect(canCastAsRitual(1, true, false)).toBe(false)
  })

  it('returns false for cantrips (level 0) even with ritual tag', () => {
    // PHB 2024: only leveled spells can be cast as rituals
    expect(canCastAsRitual(0, true, true)).toBe(false)
  })

  it('returns true for higher-level ritual spells', () => {
    expect(canCastAsRitual(3, true, true)).toBe(true)
    expect(canCastAsRitual(5, true, true)).toBe(true)
    expect(canCastAsRitual(9, true, true)).toBe(true)
  })
})

// ─── getCantripDiceCount ────────────────────────────────────────

describe('getCantripDiceCount', () => {
  it('returns 1 die at level 1 (base cantrip damage)', () => {
    expect(getCantripDiceCount(1)).toBe(1)
  })

  it('returns 1 die at level 4 (just before first scaling)', () => {
    expect(getCantripDiceCount(4)).toBe(1)
  })

  it('returns 2 dice at level 5 (PHB 2024 cantrip scaling tier 1)', () => {
    expect(getCantripDiceCount(5)).toBe(2)
  })

  it('returns 2 dice at level 10', () => {
    expect(getCantripDiceCount(10)).toBe(2)
  })

  it('returns 3 dice at level 11 (PHB 2024 cantrip scaling tier 2)', () => {
    expect(getCantripDiceCount(11)).toBe(3)
  })

  it('returns 3 dice at level 16', () => {
    expect(getCantripDiceCount(16)).toBe(3)
  })

  it('returns 4 dice at level 17 (PHB 2024 cantrip scaling tier 3)', () => {
    expect(getCantripDiceCount(17)).toBe(4)
  })

  it('returns 4 dice at level 20', () => {
    expect(getCantripDiceCount(20)).toBe(4)
  })
})

// ─── scaleCantrip ───────────────────────────────────────────────

describe('scaleCantrip', () => {
  it('scales Fire Bolt (1d10) at level 1 to 1d10', () => {
    expect(scaleCantrip('1d10', 1)).toBe('1d10')
  })

  it('scales Fire Bolt (1d10) at level 5 to 2d10', () => {
    expect(scaleCantrip('1d10', 5)).toBe('2d10')
  })

  it('scales Eldritch Blast (1d10) at level 11 to 3d10', () => {
    expect(scaleCantrip('1d10', 11)).toBe('3d10')
  })

  it('scales Sacred Flame (1d8) at level 17 to 4d8', () => {
    expect(scaleCantrip('1d8', 17)).toBe('4d8')
  })

  it('handles Toll the Dead (1d12) at level 5 to 2d12', () => {
    expect(scaleCantrip('1d12', 5)).toBe('2d12')
  })

  it('preserves modifiers in the formula (e.g., 1d10+5)', () => {
    expect(scaleCantrip('1d10+5', 5)).toBe('2d10+5')
    expect(scaleCantrip('1d10+5', 11)).toBe('3d10+5')
  })

  it('returns the original formula if it does not match dice pattern', () => {
    expect(scaleCantrip('flat 10', 5)).toBe('flat 10')
  })

  it('handles formula without leading dice count (d8)', () => {
    // The regex expects optional leading digits — "d8" has empty leading digits
    expect(scaleCantrip('d8', 5)).toBe('2d8')
  })

  it('scales d6 cantrips correctly', () => {
    expect(scaleCantrip('1d6', 5)).toBe('2d6')
    expect(scaleCantrip('1d6', 11)).toBe('3d6')
    expect(scaleCantrip('1d6', 17)).toBe('4d6')
  })
})
