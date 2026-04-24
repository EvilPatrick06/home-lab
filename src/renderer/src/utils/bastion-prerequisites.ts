import type { FacilityPrerequisite, SpecialFacilityDef } from '../types/bastion'
import type { Character5e } from '../types/character-5e'

export interface CharacterCapabilities {
  canUseArcaneFocus: boolean
  canUseHolySymbol: boolean
  canUseDruidicFocus: boolean
  canUseHolyOrDruidic: boolean
  canUseSpellcastingFocus: boolean
  canUseArtisanToolsFocus: boolean
  hasFightingStyle: boolean
  hasUnarmoredDefense: boolean
  hasExpertise: boolean
  characterLevel: number
}

const ARCANE_FOCUS_CLASSES = new Set(['wizard', 'sorcerer', 'warlock'])
const HOLY_SYMBOL_CLASSES = new Set(['cleric', 'paladin'])
const DRUIDIC_FOCUS_CLASSES = new Set(['druid'])
const FIGHTING_STYLE_CLASSES = new Set(['fighter', 'paladin', 'ranger'])
const UNARMORED_DEFENSE_CLASSES = new Set(['barbarian', 'monk'])
const ARTISAN_TOOLS_CLASSES = new Set(['artificer'])

function hasClassIn(classes: { name: string }[], classSet: Set<string>): boolean {
  return classes.some((c) => classSet.has(c.name.toLowerCase()))
}

/**
 * Analyzes a Character5e to determine bastion-related capabilities
 * based on class list, build choices, skills, and spellcasting.
 */
export function analyzeCapabilities(character: Character5e): CharacterCapabilities {
  const classes = character.classes

  const canUseArcaneFocus = hasClassIn(classes, ARCANE_FOCUS_CLASSES)
  const canUseHolySymbol = hasClassIn(classes, HOLY_SYMBOL_CLASSES)
  const canUseDruidicFocus = hasClassIn(classes, DRUIDIC_FOCUS_CLASSES)
  const canUseArtisanToolsFocus = hasClassIn(classes, ARTISAN_TOOLS_CLASSES)

  const hasFightingStyle = !!character.buildChoices.fightingStyleId || hasClassIn(classes, FIGHTING_STYLE_CLASSES)

  const hasUnarmoredDefense = hasClassIn(classes, UNARMORED_DEFENSE_CLASSES)

  const hasExpertise = character.skills.some((s) => s.expertise)

  const canUseSpellcastingFocus = !!character.spellcasting

  return {
    canUseArcaneFocus,
    canUseHolySymbol,
    canUseDruidicFocus,
    canUseHolyOrDruidic: canUseHolySymbol || canUseDruidicFocus,
    canUseSpellcastingFocus,
    canUseArtisanToolsFocus,
    hasFightingStyle,
    hasUnarmoredDefense,
    hasExpertise,
    characterLevel: character.level
  }
}

/**
 * Checks whether a set of character capabilities satisfies a single
 * facility prerequisite.
 *
 * 'faction-renown' always returns false here -- it requires a manual
 * override in the UI because renown tracking is campaign-specific.
 */
export function meetsFacilityPrerequisite(
  capabilities: CharacterCapabilities,
  prereq: FacilityPrerequisite | null
): boolean {
  if (!prereq || prereq.type === 'none') return true
  switch (prereq.type) {
    case 'arcane-focus':
      return capabilities.canUseArcaneFocus
    case 'holy-symbol':
      return capabilities.canUseHolySymbol
    case 'druidic-focus':
      return capabilities.canUseDruidicFocus
    case 'holy-or-druidic':
      return capabilities.canUseHolyOrDruidic
    case 'spellcasting-focus':
      return capabilities.canUseSpellcastingFocus
    case 'artisan-tools-focus':
      return capabilities.canUseArtisanToolsFocus
    case 'fighting-style':
      return capabilities.hasFightingStyle
    case 'unarmored-defense':
      return capabilities.hasUnarmoredDefense
    case 'expertise':
      return capabilities.hasExpertise
    case 'faction-renown':
      return false
    default:
      return false
  }
}

/**
 * Filters a list of special facility definitions to only those the
 * character is eligible for, based on both character level and
 * prerequisite satisfaction.
 */
export function getEligibleFacilities(
  character: Character5e,
  allFacilities: SpecialFacilityDef[]
): SpecialFacilityDef[] {
  const capabilities = analyzeCapabilities(character)

  return allFacilities.filter((facility) => {
    if (capabilities.characterLevel < facility.level) return false
    return meetsFacilityPrerequisite(capabilities, facility.prerequisite)
  })
}

/**
 * Returns detailed eligibility information for a single facility,
 * including a human-readable reason when the character does not qualify.
 */
export function getFacilityEligibility(
  character: Character5e,
  facility: SpecialFacilityDef
): { eligible: boolean; reason?: string } {
  const capabilities = analyzeCapabilities(character)

  if (capabilities.characterLevel < facility.level) {
    return {
      eligible: false,
      reason: `Requires character level ${facility.level} (current: ${capabilities.characterLevel})`
    }
  }

  if (!meetsFacilityPrerequisite(capabilities, facility.prerequisite)) {
    return {
      eligible: false,
      reason: facility.prerequisite?.description ?? 'Prerequisite not met'
    }
  }

  return { eligible: true }
}
