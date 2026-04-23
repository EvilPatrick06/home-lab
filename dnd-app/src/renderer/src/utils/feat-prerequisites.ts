import type { Character5e } from '../types/character-5e'
import type { AbilityName } from '../types/character-common'
import type { FeatData } from '../types/data'

/**
 * Check whether a character meets all prerequisites for a feat.
 * Returns true if all prerequisites are satisfied.
 */
export function meetsFeatPrerequisites(character: Character5e, prerequisites: FeatData['prerequisites']): boolean {
  if (prerequisites.level && character.level < prerequisites.level) {
    return false
  }
  if (prerequisites.abilityScores) {
    for (const req of prerequisites.abilityScores) {
      const meets = req.abilities.some((ability) => {
        const abilityName = ability.toLowerCase() as AbilityName
        return character.abilityScores[abilityName] >= req.minimum
      })
      if (!meets) return false
    }
  }
  return true
}
