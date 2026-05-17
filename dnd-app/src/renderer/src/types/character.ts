import type { Character5e } from './character-5e'

export type Character = Character5e

export function is5eCharacter(c: Character): c is Character5e {
  if (!c || typeof c !== 'object') return false
  if ((c as Character5e).gameSystem !== 'dnd5e') return false
  // Defense against malformed network-broadcast character shapes that pass
  // the type-level guard but crash when sections access required fields
  // (Phase 17a — DM clicking a player sheet whose `remoteCharacters[id]`
  // entry was missing `hitDice` or `abilityScores` was white-pagings the
  // app; tightening the runtime guard preempts the downstream crash).
  const c5e = c as Character5e
  if (!c5e.abilityScores || typeof c5e.abilityScores !== 'object') return false
  if (!Array.isArray(c5e.hitDice)) return false
  return true
}
