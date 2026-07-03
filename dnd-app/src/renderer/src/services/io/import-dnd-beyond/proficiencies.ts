/**
 * Proficiency + skill extraction for the D&D Beyond import.
 * Buckets DDB proficiency modifiers into weapon/armor/tool/language/saving-throw
 * groups and resolves the full 5e skill list with proficiency/expertise flags.
 */

import type { SkillProficiency5e } from '../../../types/character-5e'
import type { AbilityName } from '../../../types/character-common'
import type { DdbModifiers } from './ddb-types'

export function extractProficiencies(modifiers: DdbModifiers | undefined): {
  weapons: string[]
  armor: string[]
  tools: string[]
  languages: string[]
  savingThrows: AbilityName[]
} {
  const result = {
    weapons: [] as string[],
    armor: [] as string[],
    tools: [] as string[],
    languages: [] as string[],
    savingThrows: [] as AbilityName[]
  }
  if (!modifiers) return result

  const allMods = Object.values(modifiers).flat()
  const seen = new Set<string>()

  for (const mod of allMods) {
    if (mod.type !== 'proficiency' || !mod.subType) continue
    const key = mod.subType
    if (seen.has(key)) continue
    seen.add(key)

    const name = mod.friendlySubtypeName ?? mod.subType.replace(/-/g, ' ')

    if (key.includes('saving-throws')) {
      const abilityKey = key.replace('-saving-throws', '') as AbilityName
      if (['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(abilityKey)) {
        result.savingThrows.push(abilityKey)
      }
    } else if (key.includes('armor') || key.includes('shield')) {
      result.armor.push(name)
    } else if (
      key.includes('weapon') ||
      key.includes('sword') ||
      key.includes('bow') ||
      key.includes('crossbow') ||
      key.includes('dagger') ||
      key.includes('axe') ||
      key.includes('mace') ||
      key.includes('staff') ||
      key.includes('hammer') ||
      key.includes('spear') ||
      key.includes('pike') ||
      key.includes('halberd') ||
      key.includes('rapier') ||
      key.includes('scimitar') ||
      key.includes('flail') ||
      key.includes('morningstar') ||
      key.includes('trident') ||
      key.includes('javelin') ||
      key.includes('club') ||
      key.includes('whip') ||
      key.includes('glaive') ||
      key.includes('maul') ||
      key.includes('lance') ||
      key.includes('dart') ||
      key.includes('sling') ||
      key.includes('blowgun')
    ) {
      result.weapons.push(name)
    } else if (key.includes('language')) {
      result.languages.push(name.replace(/language[:\s]*/i, ''))
    } else {
      result.tools.push(name)
    }
  }

  return result
}

const SKILL_ABILITY_MAP: Record<string, AbilityName> = {
  acrobatics: 'dexterity',
  'animal-handling': 'wisdom',
  arcana: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  nature: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  religion: 'intelligence',
  'sleight-of-hand': 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom'
}

const SKILL_DISPLAY_NAMES: Record<string, string> = {
  acrobatics: 'Acrobatics',
  'animal-handling': 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  'sleight-of-hand': 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival'
}

export function extractSkills(modifiers: DdbModifiers | undefined): SkillProficiency5e[] {
  const proficient = new Set<string>()
  const expertise = new Set<string>()

  if (modifiers) {
    const allMods = Object.values(modifiers).flat()
    for (const mod of allMods) {
      if (!mod.subType) continue
      const skillKey = mod.subType

      if (mod.type === 'expertise') {
        expertise.add(skillKey)
        proficient.add(skillKey)
      } else if (mod.type === 'proficiency') {
        if (SKILL_ABILITY_MAP[skillKey]) {
          proficient.add(skillKey)
        }
      } else if (mod.type === 'half-proficiency' || mod.type === 'half-proficiency-round-up') {
        proficient.add(skillKey)
      }
    }
  }

  return Object.entries(SKILL_ABILITY_MAP).map(([key, ability]) => ({
    name: SKILL_DISPLAY_NAMES[key] ?? key,
    ability,
    proficient: proficient.has(key),
    expertise: expertise.has(key)
  }))
}
