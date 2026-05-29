/**
 * Builder existing-character carry-over — D&D 5e 2024
 *
 * Pure computation extracted from build-character-5e. When editing an existing
 * character, carries forward the optional sub-system fields that the builder
 * does not itself recompute (pact slots, invocations, metamagic, weapon
 * mastery, companions, active wild-shape form). Only present (non-null) keys
 * are included so the result can be spread onto the rebuilt character without
 * clobbering defaults. No store get/set closure.
 */
import type { Character5e } from '../../../../types/character-5e'

const CARRY_OVER_KEYS = [
  'pactMagicSlotLevels',
  'invocationsKnown',
  'metamagicKnown',
  'weaponMasteryChoices',
  'companions',
  'activeWildShapeFormId'
] as const

type CarryOverKey = (typeof CARRY_OVER_KEYS)[number]

export function computeExistingCharCarryOver5e(
  existingChar5e: Character5e | undefined
): Partial<Pick<Character5e, CarryOverKey>> {
  const ec = existingChar5e
  return Object.fromEntries(CARRY_OVER_KEYS.filter((k) => ec?.[k] != null).map((k) => [k, ec![k]])) as Partial<
    Pick<Character5e, CarryOverKey>
  >
}
