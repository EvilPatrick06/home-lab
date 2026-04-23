/**
 * Spell Slot Mechanics — D&D 5e 2024 (PHB Chapter 7)
 *
 * Pure utility functions for spell slot expenditure and cantrip scaling.
 * No store dependencies — can be used in any context.
 */

export interface SpellSlotState {
  spellSlotLevels: Record<number, { current: number; max: number }>
  pactMagicSlotLevels?: Record<number, { current: number; max: number }>
}

/**
 * Attempt to spend a spell slot of the given level.
 * Returns true if successful, false if no slot available.
 */
export function expendSpellSlot(
  slots: SpellSlotState,
  level: number,
  usePactSlot: boolean = false
): { success: boolean; updatedSlots: SpellSlotState; summary: string } {
  if (level === 0) {
    // Cantrips don't use slots
    return { success: true, updatedSlots: slots, summary: 'Cantrip (no slot needed)' }
  }

  const slotPool = usePactSlot ? slots.pactMagicSlotLevels : slots.spellSlotLevels
  if (!slotPool) {
    return {
      success: false,
      updatedSlots: slots,
      summary: `No ${usePactSlot ? 'pact magic ' : ''}spell slots available.`
    }
  }

  const slot = slotPool[level]
  if (!slot || slot.current <= 0) {
    return {
      success: false,
      updatedSlots: slots,
      summary: `No level ${level} ${usePactSlot ? 'pact magic ' : ''}spell slots remaining.`
    }
  }

  const updatedPool = {
    ...slotPool,
    [level]: { ...slot, current: slot.current - 1 }
  }

  const updatedSlots: SpellSlotState = usePactSlot
    ? { ...slots, pactMagicSlotLevels: updatedPool }
    : { ...slots, spellSlotLevels: updatedPool }

  return {
    success: true,
    updatedSlots,
    summary: `Expended level ${level} ${usePactSlot ? 'pact magic ' : ''}spell slot. (${slot.current - 1}/${slot.max} remaining)`
  }
}

/**
 * Check if a spell can be cast as a ritual (no slot cost, +10 min casting time).
 * Requires: spell has ritual tag, caster has Ritual Caster feat or class feature.
 */
export function canCastAsRitual(spellLevel: number, isRitual: boolean, hasRitualCasting: boolean): boolean {
  return isRitual && hasRitualCasting && spellLevel > 0
}

/**
 * Get cantrip damage scaling based on character level (PHB 2024 p.236).
 * Cantrips scale at levels 5, 11, and 17.
 */
export function getCantripDiceCount(characterLevel: number): number {
  if (characterLevel >= 17) return 4
  if (characterLevel >= 11) return 3
  if (characterLevel >= 5) return 2
  return 1
}

/**
 * Scale a cantrip damage formula based on character level.
 * E.g., "1d10" at level 5 becomes "2d10", at level 11 becomes "3d10".
 */
export function scaleCantrip(baseFormula: string, characterLevel: number): string {
  const match = baseFormula.match(/^(\d*)d(\d+)(.*)$/)
  if (!match) return baseFormula
  const diceCount = getCantripDiceCount(characterLevel)
  const sides = match[2]
  const rest = match[3] || ''
  return `${diceCount}d${sides}${rest}`
}
