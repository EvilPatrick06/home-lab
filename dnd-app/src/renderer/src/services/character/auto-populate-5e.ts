import speciesSpellsJson from '@data/5e/character/species-spells.json'
import type { Character5e } from '../../types/character-5e'
import type { AbilityName, SpellEntry } from '../../types/character-common'
import { load5eSpeciesSpells } from '../data-provider'

// Skill-to-ability mapping for 5e
export const SKILL_ABILITY_MAP_5E: Record<string, AbilityName> = {
  Acrobatics: 'dexterity',
  'Animal Handling': 'wisdom',
  Arcana: 'intelligence',
  Athletics: 'strength',
  Deception: 'charisma',
  History: 'intelligence',
  Insight: 'wisdom',
  Intimidation: 'charisma',
  Investigation: 'intelligence',
  Medicine: 'wisdom',
  Nature: 'intelligence',
  Perception: 'wisdom',
  Performance: 'charisma',
  Persuasion: 'charisma',
  Religion: 'intelligence',
  'Sleight of Hand': 'dexterity',
  Stealth: 'dexterity',
  Survival: 'wisdom'
}

export function populateSkills5e(selectedSkills: string[]): Character5e['skills'] {
  return Object.entries(SKILL_ABILITY_MAP_5E).map(([name, ability]) => ({
    name,
    ability,
    proficient: selectedSkills.includes(name),
    expertise: false
  }))
}

// Known spell data for common species cantrips and species spells
const SPECIES_SPELL_DATA: Record<string, Omit<SpellEntry, 'id'>> = speciesSpellsJson

/**
 * Detect and return spells granted by species traits.
 * Uses the spellGranted field on traits for 2024 species data.
 * Falls back to description parsing for legacy data.
 */
export function getSpellsFromTraits(
  traits: Array<{ name: string; description: string; spellGranted?: string | { list: string; count: number } }>,
  speciesName: string
): SpellEntry[] {
  const spells: SpellEntry[] = []

  for (const trait of traits) {
    // 2024 species: use spellGranted field
    if (trait.spellGranted) {
      if (typeof trait.spellGranted === 'string') {
        // Direct spell name (e.g., "light", "thaumaturgy")
        const spellKey = trait.spellGranted.toLowerCase()
        const spellData = SPECIES_SPELL_DATA[spellKey]
        if (spellData) {
          spells.push({
            id: `species-${spellKey}-${speciesName}`,
            ...spellData
          })
        } else {
          // Unknown spell - create placeholder
          spells.push({
            id: `species-${spellKey}-${speciesName}`,
            name: trait.spellGranted.charAt(0).toUpperCase() + trait.spellGranted.slice(1),
            level: 0,
            description: `Species cantrip from ${trait.name}.`,
            castingTime: 'Varies',
            range: 'Varies',
            duration: 'Varies',
            components: 'Varies',
            school: 'Varies'
          })
        }
      } else {
        // Spell list pick (e.g., { list: "wizard", count: 1 })
        spells.push({
          id: `species-cantrip-${speciesName}`,
          name: `Species Cantrip (${trait.spellGranted.list.charAt(0).toUpperCase() + trait.spellGranted.list.slice(1)})`,
          level: 0,
          description: trait.description,
          castingTime: 'Varies',
          range: 'Varies',
          duration: 'Varies',
          components: 'Varies',
          school: 'Varies',
          classes: [trait.spellGranted.list.charAt(0).toUpperCase() + trait.spellGranted.list.slice(1)]
        })
      }
    }
  }

  return spells
}

/**
 * Returns species spells unlocked via spell progression (level 3/5 spells from subraces).
 * Uses the `spellProgression` array on subrace data.
 * `innateUses`: 1 = once per Long Rest, -1 = proficiency bonus uses per Long Rest.
 */
export function getSpeciesSpellProgression(
  spellProgression: Array<{ spellId: string; grantedAtLevel: number; innateUses: number }>,
  characterLevel: number,
  speciesName: string
): SpellEntry[] {
  const spells: SpellEntry[] = []

  for (const prog of spellProgression) {
    if (characterLevel < prog.grantedAtLevel) continue
    const spellData = SPECIES_SPELL_DATA[prog.spellId]
    if (!spellData) continue

    spells.push({
      id: `species-${prog.spellId}-${speciesName}`,
      ...spellData,
      source: 'species',
      innateUses: { max: prog.innateUses, remaining: prog.innateUses === -1 ? -1 : prog.innateUses }
    })
  }

  return spells
}

/**
 * Load species spell data from the data store (includes homebrew/plugin species spells).
 * Useful when building characters with homebrewed species that grant spells.
 */
export async function loadSpeciesSpellData(): Promise<Record<string, unknown>> {
  const data = await load5eSpeciesSpells()
  return data as unknown as Record<string, unknown>
}
