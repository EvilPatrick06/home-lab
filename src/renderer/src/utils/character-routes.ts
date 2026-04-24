import type { Character } from '../types/character'

export function getCharacterSheetPath(character: Character): string {
  return `/characters/5e/${character.id}`
}

export function getBuilderCreatePath(): string {
  return `/characters/5e/create`
}

export function getBuilderEditPath(character: Character): string {
  return `/characters/5e/edit/${character.id}`
}

export function getLevelUpPath(character: Character): string {
  return `/characters/5e/${character.id}/levelup`
}
