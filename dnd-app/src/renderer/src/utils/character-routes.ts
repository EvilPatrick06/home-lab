import type { Character } from '../types/character'
import { GAME_SYSTEMS, type GameSystem } from '../types/game-system'

// PHASE-38 38B — the URL segment for 5e is '5e' (legacy) while the system id is 'dnd5e'.
const SEGMENT_BY_SYSTEM: Record<string, string> = { dnd5e: '5e' }

export function routeSegmentForSystem(system: GameSystem): string {
  return SEGMENT_BY_SYSTEM[system] ?? system
}

export function systemIdFromRouteSegment(segment: string): GameSystem | null {
  if (segment === '5e') return 'dnd5e'
  return segment in GAME_SYSTEMS ? segment : null
}

export function getCharacterSheetPath(character: Character): string {
  return `/characters/5e/${character.id}`
}

export function getBuilderCreatePath(system: GameSystem = 'dnd5e'): string {
  return `/characters/${routeSegmentForSystem(system)}/create`
}

export function getBuilderEditPath(character: Character): string {
  return `/characters/5e/edit/${character.id}`
}

export function getLevelUpPath(character: Character): string {
  return `/characters/5e/${character.id}/levelup`
}
