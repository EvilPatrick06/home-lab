import type { Character5e } from './character-5e'

export type Character = Character5e

export function is5eCharacter(c: Character): c is Character5e {
  return c.gameSystem === 'dnd5e'
}
