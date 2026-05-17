/**
 * Player character → MapToken factory. (Phase 13g)
 *
 * Returns a partial `MapToken` populated from the character sheet:
 * HP, AC, walk/swim/fly/climb speed, darkvision (range + species
 * fallback), resistances/immunities/vulnerabilities, initiative mod,
 * and a 3-letter label derived from the name. The DM then drops the
 * returned partial into `placeTokenOnMap(...)` (or whatever placement
 * flow is active) to put it on the grid.
 *
 * Why a partial: `gridX`/`gridY`/`floor`/`id` are placement-time
 * decisions; this helper only derives the *stats* side.
 */

import type { Character5e } from '../../types/character-5e'
import type { MapToken } from '../../types/map'
import { DARKVISION_SPECIES } from '../../types/map'

/** Parse a string like "darkvision 60 ft." → 60. Returns 0 when the senses array doesn't carry it. */
function darkvisionRangeFromSenses(senses: string[] | undefined): number {
  for (const raw of senses ?? []) {
    const match = /darkvision\s+(\d+)/i.exec(raw)
    if (match) return Number.parseInt(match[1], 10)
  }
  return 0
}

function hasSuperiorDarkvision(character: Character5e): boolean {
  const featureMatch = (character.features ?? []).some((f) => /superior\s+darkvision/i.test(f.name))
  if (featureMatch) return true
  return (character.senses ?? []).some((s) => /darkvision\s+120/i.test(s))
}

/**
 * Build a placement-ready MapToken stub from a player character sheet.
 * Caller is expected to fill in `gridX` / `gridY` / `floor` / `id`
 * before passing to the token-placement helpers.
 */
export function buildTokenStubFromCharacter(character: Character5e): Omit<MapToken, 'id' | 'gridX' | 'gridY'> {
  const speciesKey = character.species?.toLowerCase() ?? ''
  const speciesHasDarkvision = DARKVISION_SPECIES.includes(speciesKey)
  const sensesRange = darkvisionRangeFromSenses(character.senses)
  const darkvisionRange = hasSuperiorDarkvision(character)
    ? 120
    : sensesRange > 0
      ? sensesRange
      : speciesHasDarkvision
        ? 60
        : 0

  return {
    entityId: character.id,
    entityType: 'player',
    label: character.name.slice(0, 3).toUpperCase() || 'P1',
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    nameVisible: true,
    conditions: [],
    currentHP: character.hitPoints.current,
    maxHP: character.hitPoints.maximum,
    ac: character.armorClass,
    walkSpeed: character.speed,
    swimSpeed: character.speeds?.swim || undefined,
    climbSpeed: character.speeds?.climb || undefined,
    flySpeed: character.speeds?.fly || undefined,
    initiativeModifier: character.initiative,
    darkvision: darkvisionRange > 0 || speciesHasDarkvision,
    ...(darkvisionRange > 0 ? { darkvisionRange } : {}),
    resistances: character.resistances?.length ? [...character.resistances] : undefined,
    immunities: character.immunities?.length ? [...character.immunities] : undefined,
    vulnerabilities: character.vulnerabilities?.length ? [...character.vulnerabilities] : undefined
  }
}
