import type { Character5e } from '../../types/character-5e'

/**
 * Get the critical hit threshold for a character.
 * Champion Fighters get Improved Critical (19-20) at level 3
 * and Superior Critical (18-20) at level 15.
 */
export function getCritThreshold(character: Character5e): number {
  const fighterClass = character.classes.find((c) => c.name.toLowerCase() === 'fighter')
  if (!fighterClass) return 20

  const isChampion =
    (character.buildChoices.classId === 'fighter' && character.buildChoices.subclassId === 'champion') ||
    (character.buildChoices.multiclassEntries ?? []).some((e) => e.classId === 'fighter' && e.subclassId === 'champion')
  if (!isChampion) return 20

  if (fighterClass.level >= 15) return 18 // Superior Critical
  if (fighterClass.level >= 3) return 19 // Improved Critical
  return 20
}
