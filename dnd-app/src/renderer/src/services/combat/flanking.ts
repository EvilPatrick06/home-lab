import type { MapToken } from '../../types/map'

/**
 * DMG 2024 optional flanking rule:
 * When a creature and at least one ally are adjacent to the same enemy
 * and on opposite sides of that enemy, they have advantage on melee
 * attack rolls against the enemy.
 *
 * "Opposite sides" is determined by drawing a line between the centers
 * of the two flanking creatures — if the line passes through opposite
 * sides or corners of the target's space, flanking applies.
 */

/**
 * Get the center point of a token (in grid coordinates).
 */
function tokenCenter(token: MapToken): { x: number; y: number } {
  return {
    x: token.gridX + token.sizeX / 2,
    y: token.gridY + token.sizeY / 2
  }
}

/**
 * Check if a line from point A to point B passes through opposite sides
 * of the target's grid space. We check whether the line intersects
 * opposing edges or opposite corners of the target's bounding box.
 */
function lineThroughOpposites(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  targetX: number,
  targetY: number,
  targetSizeX: number,
  targetSizeY: number
): boolean {
  const cx = targetX + targetSizeX / 2
  const cy = targetY + targetSizeY / 2

  // Vector from center to each flanker
  const dax = ax - cx
  const day = ay - cy
  const dbx = bx - cx
  const dby = by - cy

  // Two creatures are on opposite sides if the dot product of their
  // displacement vectors from the target center is negative
  // (i.e. they are in opposite hemispheres relative to the target)
  const dot = dax * dbx + day * dby
  return dot < 0
}

/**
 * Check if two tokens are adjacent (within melee reach).
 * Replicates the logic from combat-rules.ts isAdjacent.
 */
function areAdjacent(a: MapToken, b: MapToken): boolean {
  for (let dx = 0; dx < a.sizeX; dx++) {
    for (let dy = 0; dy < a.sizeY; dy++) {
      const x1 = a.gridX + dx
      const y1 = a.gridY + dy
      for (let ex = 0; ex < b.sizeX; ex++) {
        for (let ey = 0; ey < b.sizeY; ey++) {
          const x2 = b.gridX + ex
          const y2 = b.gridY + ey
          if (Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1 && !(x1 === x2 && y1 === y2)) {
            return true
          }
        }
      }
    }
  }
  return false
}

/**
 * Determines if the attacker is flanking the target with help from an ally.
 * Returns the name of the flanking ally, or null if not flanking.
 *
 * Conditions:
 * 1. Attacker is adjacent to target (melee range)
 * 2. At least one ally of the attacker is also adjacent to the target
 * 3. The ally and attacker are on opposite sides of the target
 * 4. Neither the attacker nor the ally is Incapacitated
 */
export function checkFlanking(
  attacker: MapToken,
  target: MapToken,
  allTokens: MapToken[],
  incapacitatedEntityIds: Set<string>
): string | null {
  // Flanking only works if attacker is in melee range
  if (!areAdjacent(attacker, target)) return null

  // Attacker must not be incapacitated
  if (incapacitatedEntityIds.has(attacker.entityId)) return null

  const attackerCenter = tokenCenter(attacker)

  // Find allies adjacent to the same target on opposite sides
  for (const token of allTokens) {
    // Must be on same team as attacker
    if (token.entityType !== attacker.entityType) continue
    // Must not be the attacker itself
    if (token.id === attacker.id) continue
    // Must be adjacent to the target
    if (!areAdjacent(token, target)) continue
    // Must not be incapacitated
    if (incapacitatedEntityIds.has(token.entityId)) continue

    const allyCenter = tokenCenter(token)

    // Check if on opposite sides
    if (
      lineThroughOpposites(
        attackerCenter.x,
        attackerCenter.y,
        allyCenter.x,
        allyCenter.y,
        target.gridX,
        target.gridY,
        target.sizeX,
        target.sizeY
      )
    ) {
      return token.label
    }
  }

  return null
}
