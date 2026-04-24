import type { TurnState } from '../../types/game-state'
import type { MapToken, TerrainCell } from '../../types/map'

export type DiagonalRule = 'standard' | 'alternate'

/**
 * Calculate grid distance between two positions in feet (5ft per cell).
 * Uses standard D&D 5e diagonal movement (each diagonal = 5ft).
 * Optionally accounts for elevation difference (3D distance).
 */
export function gridDistanceFeet(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  elevation1 = 0,
  elevation2 = 0
): number {
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  // Chebyshev distance (D&D 5e standard: each diagonal = 5ft)
  const horizontalDist = Math.max(dx, dy) * 5
  const elevationDiff = Math.abs(elevation2 - elevation1)
  if (elevationDiff === 0) return horizontalDist
  // 3D distance: use Pythagorean, round to nearest 5ft increment
  return Math.max(5, Math.round(Math.sqrt(horizontalDist ** 2 + elevationDiff ** 2) / 5) * 5)
}

/**
 * Calculate grid distance using DMG 2024 p.18 alternating diagonal rule.
 * Odd diagonals cost 5ft, even diagonals cost 10ft (5/10/5/10...).
 * The result is the total cost to move dx horizontal + dy vertical cells diagonally.
 */
export function gridDistanceFeetAlternate(x1: number, y1: number, x2: number, y2: number): number {
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  const diag = Math.min(dx, dy)
  const straight = Math.max(dx, dy) - diag
  // Odd diagonals cost 5ft, even diagonals cost 10ft
  const fullPairs = Math.floor(diag / 2) // Each pair costs 15ft (5+10)
  const remainder = diag % 2 // 0 or 1 remaining diagonal (costs 5ft)
  const diagCost = fullPairs * 15 + remainder * 5
  return diagCost + straight * 5
}

/**
 * Calculate fall damage per PHB 2024 p.368.
 * 1d6 bludgeoning damage per 10 feet fallen, maximum 20d6.
 * Returns the number of d6s to roll.
 */
export function fallDamageDice(distanceFeet: number): number {
  return Math.min(20, Math.max(0, Math.floor(distanceFeet / 10)))
}

/**
 * Token speed capabilities for terrain cost calculation.
 */
export interface TokenSpeeds {
  hasSwimSpeed?: boolean
  hasClimbSpeed?: boolean
}

/**
 * Calculate movement cost from one cell to another, accounting for terrain.
 * Water terrain costs 2x without swim speed, climbing terrain costs 2x without climb speed.
 */
export function movementCostFeet(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  terrain: TerrainCell[],
  tokenSpeeds?: TokenSpeeds
): number {
  const baseDist = gridDistanceFeet(x1, y1, x2, y2)
  const destTerrain = terrain.find((t) => t.x === x2 && t.y === y2)
  if (!destTerrain) return baseDist

  // Water terrain: free with swim speed, 2x otherwise
  if (destTerrain.type === 'water') {
    return tokenSpeeds?.hasSwimSpeed ? baseDist : baseDist * 2
  }
  // Climbing terrain: free with climb speed, 2x otherwise
  if (destTerrain.type === 'climbing') {
    return tokenSpeeds?.hasClimbSpeed ? baseDist : baseDist * 2
  }
  // Other terrain with custom movement cost
  if (destTerrain.movementCost > 1) {
    return baseDist * destTerrain.movementCost
  }
  return baseDist
}

/**
 * Check if a token can move to a target position given remaining movement.
 */
export function canMoveToPosition(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  turnState: TurnState | undefined,
  terrain: TerrainCell[]
): { allowed: boolean; cost: number; remaining: number } {
  if (!turnState) {
    return { allowed: true, cost: 0, remaining: 0 }
  }

  const cost = movementCostFeet(fromX, fromY, toX, toY, terrain)
  const allowed = cost <= turnState.movementRemaining
  return {
    allowed,
    cost,
    remaining: turnState.movementRemaining - cost
  }
}

/**
 * Get all cells reachable from a position with given remaining movement.
 * Returns cells with their movement cost. Accounts for swim/climb speeds.
 * Supports alternating diagonal rule (5/10/5/10) when diagonalRule is 'alternate'.
 */
export function getReachableCells(
  startX: number,
  startY: number,
  movementRemaining: number,
  terrain: TerrainCell[],
  gridWidth: number,
  gridHeight: number,
  tokenSpeeds?: TokenSpeeds,
  diagonalRule: DiagonalRule = 'standard'
): Array<{ x: number; y: number; cost: number }> {
  const reachable: Array<{ x: number; y: number; cost: number }> = []

  // BFS flood fill — track diagonal count for alternating rule
  const visited = new Map<string, number>() // key -> min cost to reach
  const queue: Array<{ x: number; y: number; costSoFar: number; diagCount: number }> = [
    { x: startX, y: startY, costSoFar: 0, diagCount: 0 }
  ]
  visited.set(`${startX},${startY}`, 0)

  while (queue.length > 0) {
    const { x, y, costSoFar, diagCount } = queue.shift()!

    // Check all 8 neighbors (including diagonals)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy

        if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue

        const isDiagonal = dx !== 0 && dy !== 0
        let newDiagCount = diagCount

        // Base step cost: 5ft for cardinal, 5 or 10 for diagonal depending on rule
        let baseCost = 5
        if (isDiagonal && diagonalRule === 'alternate') {
          newDiagCount++
          // Even diagonals cost 10ft, odd cost 5ft (1st=5, 2nd=10, 3rd=5...)
          baseCost = newDiagCount % 2 === 0 ? 10 : 5
        }

        // Apply terrain multiplier
        const terrainCell = terrain.find((t) => t.x === nx && t.y === ny)
        let moveCost = baseCost
        if (terrainCell) {
          if (terrainCell.type === 'water') {
            moveCost = tokenSpeeds?.hasSwimSpeed ? baseCost : baseCost * 2
          } else if (terrainCell.type === 'climbing') {
            moveCost = tokenSpeeds?.hasClimbSpeed ? baseCost : baseCost * 2
          } else {
            moveCost = baseCost * terrainCell.movementCost
          }
        }
        const totalCost = costSoFar + moveCost

        if (totalCost > movementRemaining) continue

        const key = `${nx},${ny}`
        const existingCost = visited.get(key)
        if (existingCost !== undefined && existingCost <= totalCost) continue

        visited.set(key, totalCost)
        reachable.push({ x: nx, y: ny, cost: totalCost })
        queue.push({ x: nx, y: ny, costSoFar: totalCost, diagCount: newDiagCount })
      }
    }
  }

  return reachable
}

/**
 * Check if two tokens are adjacent (within 5ft melee range).
 */
export function isAdjacent(token1: MapToken, token2: MapToken): boolean {
  // Account for token sizes
  for (let dx = 0; dx < token1.sizeX; dx++) {
    for (let dy = 0; dy < token1.sizeY; dy++) {
      const x1 = token1.gridX + dx
      const y1 = token1.gridY + dy
      for (let ex = 0; ex < token2.sizeX; ex++) {
        for (let ey = 0; ey < token2.sizeY; ey++) {
          const x2 = token2.gridX + ex
          const y2 = token2.gridY + ey
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
 * Movement type for OA determination.
 * - 'walk': normal movement, can trigger OA
 * - 'teleport': teleportation, never triggers OA
 * - 'forced': forced movement (push, pull), never triggers OA
 */
export type MovementType = 'walk' | 'teleport' | 'forced'

/**
 * Check if a token was adjacent before a move but isn't anymore (opportunity attack trigger).
 * Teleport and forced movement never trigger OA.
 */
export function triggersOpportunityAttack(
  movingToken: MapToken,
  enemyToken: MapToken,
  newX: number,
  newY: number,
  movementType: MovementType = 'walk'
): boolean {
  // Teleport and forced movement never trigger OA
  if (movementType !== 'walk') return false

  // Was adjacent before?
  const wasAdj = isAdjacent(movingToken, enemyToken)
  if (!wasAdj) return false

  // Is still adjacent after?
  const movedToken = { ...movingToken, gridX: newX, gridY: newY }
  const stillAdj = isAdjacent(movedToken, enemyToken)

  return !stillAdj // Triggers OA if was adjacent but no longer
}

/**
 * Calculate effective speed considering conditions and encumbrance.
 * If isEncumbered is true (weight > carrying capacity), speed capped at 5 ft.
 * If isOverLimit is true (weight > drag/lift/push), speed is 0.
 */
export function getEffectiveSpeed(
  baseSpeed: number,
  conditions: Array<{ name: string; value?: number }>,
  encumbrance?: { isEncumbered?: boolean; isOverLimit?: boolean }
): number {
  // Over drag/lift/push limit = cannot move
  if (encumbrance?.isOverLimit) return 0

  const hasGrappled = conditions.some((c) => c.name.toLowerCase() === 'grappled')
  const hasRestrained = conditions.some((c) => c.name.toLowerCase() === 'restrained')
  if (hasGrappled || hasRestrained) return 0

  const exhaustion = conditions.find((c) => c.name.toLowerCase() === 'exhaustion')
  const exhaustionPenalty = (exhaustion?.value ?? 0) * 5

  let speed = Math.max(0, baseSpeed - exhaustionPenalty)

  // Over carry capacity = speed reduced to 5 ft max
  if (encumbrance?.isEncumbered) {
    speed = Math.min(5, speed)
  }

  return speed
}

/**
 * Calculate prone stand-up cost (half max speed).
 */
export function proneStandUpCost(maxSpeed: number): number {
  return Math.floor(maxSpeed / 2)
}

/**
 * Check melee weapon range (5ft for standard, 10ft for reach weapons).
 */
export function isInMeleeRange(attacker: MapToken, target: MapToken, reach: number = 5): boolean {
  const dist = gridDistanceFeet(
    attacker.gridX,
    attacker.gridY,
    target.gridX,
    target.gridY,
    attacker.elevation ?? 0,
    target.elevation ?? 0
  )
  return dist <= reach
}

/**
 * Check ranged weapon range.
 * Returns: 'normal' | 'long' | 'out-of-range'
 */
export function checkRangedRange(
  attacker: MapToken,
  target: MapToken,
  normalRange: number,
  longRange: number
): 'normal' | 'long' | 'out-of-range' {
  const dist = gridDistanceFeet(
    attacker.gridX,
    attacker.gridY,
    target.gridX,
    target.gridY,
    attacker.elevation ?? 0,
    target.elevation ?? 0
  )
  if (dist <= normalRange) return 'normal'
  if (dist <= longRange) return 'long'
  return 'out-of-range'
}

/**
 * Cover types and their bonuses.
 */
export type CoverType = 'none' | 'half' | 'three-quarters' | 'total'

export function getCoverACBonus(cover: CoverType): number {
  switch (cover) {
    case 'half':
      return 2
    case 'three-quarters':
      return 5
    case 'total':
      return Infinity // Can't target
    default:
      return 0
  }
}

export function getCoverDexSaveBonus(cover: CoverType): number {
  switch (cover) {
    case 'half':
      return 2
    case 'three-quarters':
      return 5
    default:
      return 0
  }
}

/**
 * Get size category from token dimensions.
 * 1x1 = Tiny/Small/Medium (1), 2x2 = Large (2), 3x3 = Huge (3), 4x4 = Gargantuan (4)
 */
export function getTokenSizeCategory(token: MapToken): number {
  return Math.max(token.sizeX, token.sizeY)
}

/**
 * Check if attacker can Grapple or Shove a target (target max 1 size larger).
 */
export function canGrappleOrShove(attacker: MapToken, target: MapToken): boolean {
  return getTokenSizeCategory(target) <= getTokenSizeCategory(attacker) + 1
}

/**
 * Calculate Unarmed Strike save DC: 8 + STR modifier + proficiency bonus.
 */
export function unarmedStrikeDC(strScore: number, profBonus: number): number {
  const strMod = Math.floor((strScore - 10) / 2)
  return 8 + strMod + profBonus
}

/**
 * Check if movement is blocked by Frightened condition.
 * A Frightened creature cannot willingly move closer to the source of its fear.
 */
export function isMoveBlockedByFear(
  tokenX: number,
  tokenY: number,
  newX: number,
  newY: number,
  fearSourceX: number,
  fearSourceY: number
): boolean {
  const currentDist = gridDistanceFeet(tokenX, tokenY, fearSourceX, fearSourceY)
  const newDist = gridDistanceFeet(newX, newY, fearSourceX, fearSourceY)
  return newDist < currentDist
}

// ─── Weapon Mastery Effect Application ──────────────────────

export interface MasteryEffectResult {
  mastery: string
  description: string
  requiresSave?: { dc: number; ability: 'constitution' | 'strength' | 'dexterity' }
  appliedCondition?: string
  speedReduction?: number
  pushDistance?: number
  grantAdvantage?: boolean
  extraAttack?: 'cleave' | 'nick'
  grazeDamage?: number
}

/**
 * Determine what mastery effects should apply after a hit (or miss for Graze).
 */
export function getMasteryEffect(
  mastery: string,
  abilityMod: number,
  profBonus: number,
  isHit: boolean
): MasteryEffectResult | null {
  switch (mastery) {
    case 'Slow':
      if (!isHit) return null
      return {
        mastery: 'Slow',
        description: 'Target speed reduced by 10 ft until start of your next turn.',
        speedReduction: 10
      }
    case 'Sap':
      if (!isHit) return null
      return {
        mastery: 'Sap',
        description: 'Target has disadvantage on its next attack roll.',
        appliedCondition: 'Sapped'
      }
    case 'Vex':
      if (!isHit) return null
      return {
        mastery: 'Vex',
        description: 'You have advantage on your next attack against this target.',
        grantAdvantage: true
      }
    case 'Push':
      if (!isHit) return null
      return {
        mastery: 'Push',
        description: 'Target pushed up to 10 ft straight away (if Large or smaller).',
        pushDistance: 10
      }
    case 'Topple':
      if (!isHit) return null
      return {
        mastery: 'Topple',
        description: `Target must make a CON save (DC ${8 + abilityMod + profBonus}) or be knocked Prone.`,
        requiresSave: { dc: 8 + abilityMod + profBonus, ability: 'constitution' },
        appliedCondition: 'Prone'
      }
    case 'Graze':
      if (isHit) return null // Graze only on miss
      return {
        mastery: 'Graze',
        description: `On miss: deal ${Math.max(0, abilityMod)} damage (ability modifier).`,
        grazeDamage: Math.max(0, abilityMod)
      }
    case 'Nick':
      if (!isHit) return null
      return {
        mastery: 'Nick',
        description: 'Extra attack as part of Attack action (instead of Bonus Action).',
        extraAttack: 'nick'
      }
    case 'Cleave':
      if (!isHit) return null
      return {
        mastery: 'Cleave',
        description:
          'Make a melee attack against a second creature within 5 ft of the first (no ability mod to damage).',
        extraAttack: 'cleave'
      }
    default:
      return null
  }
}
