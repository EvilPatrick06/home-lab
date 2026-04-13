/**
 * A* pathfinding for D&D 5e grid movement.
 *
 * Features:
 * - Wall-aware: solid walls and closed doors block movement
 * - Terrain costs: difficult terrain = 2x, water without swim speed = 2x, etc.
 * - Movement budget: stops path when budget exhausted
 * - Diagonal movement: all diagonals cost 5ft (standard D&D 5e)
 * - Hex grid support: 6 neighbors instead of 8 for hex grids
 */

import type { GridSettings, TerrainCell, WallSegment } from '../../types/map'
import type { DiagonalRule, TokenSpeeds } from '../combat/combat-rules'

type GridType = GridSettings['type']

interface PathNode {
  x: number
  y: number
  g: number // cost from start
  f: number // g + heuristic
  parent: PathNode | null
  diagCount: number // running diagonal count for alternating rule
}

export interface PathResult {
  /** Ordered list of grid cells from start to goal (inclusive) */
  path: Array<{ x: number; y: number }>
  /** Total movement cost in feet */
  totalCost: number
  /** Whether the goal was reached within budget */
  reachedGoal: boolean
}

/**
 * Check if movement between two adjacent cells is blocked by a wall.
 * Walls are defined by grid-edge coordinates (e.g. wall from (2,0) to (2,3) blocks
 * movement across the x=2 grid line).
 */
export function isMovementBlockedByWall(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  walls: WallSegment[]
): boolean {
  // Movement direction
  const dx = toX - fromX
  const dy = toY - fromY

  for (const wall of walls) {
    // Skip open doors and windows — they don't block movement
    if (wall.isOpen && wall.type === 'door') continue
    if (wall.type === 'window') continue
    // Transparent walls block movement (force walls — see through but not pass)
    // One-way walls: only block from the blocked side
    if (wall.type === 'one-way') {
      // Compute whether the mover is on the blocked side of the one-way wall
      const midX = (wall.x1 + wall.x2) / 2
      const midY = (wall.y1 + wall.y2) / 2
      let normalAngle: number
      if (wall.oneWayDirection !== undefined) {
        normalAngle = (wall.oneWayDirection * Math.PI) / 180
      } else {
        const wallDx = wall.x2 - wall.x1
        const wallDy = wall.y2 - wall.y1
        normalAngle = Math.atan2(-wallDx, wallDy)
      }
      const normalX = Math.cos(normalAngle)
      const normalY = Math.sin(normalAngle)
      // Use cell center as origin point
      const fromCenterX = fromX + 0.5
      const fromCenterY = fromY + 0.5
      const toPointX = fromCenterX - midX
      const toPointY = fromCenterY - midY
      const dot = toPointX * normalX + toPointY * normalY
      // Not on the blocked side — skip this wall
      if (dot <= 0) continue
    }

    // Check if this wall segment blocks movement from (fromX,fromY) to (toX,toY)
    if (wallBlocksMovement(fromX, fromY, dx, dy, wall)) return true
  }
  return false
}

/**
 * Check if a specific wall segment blocks a single-cell movement.
 */
function wallBlocksMovement(fromX: number, fromY: number, dx: number, dy: number, wall: WallSegment): boolean {
  // Convert movement to the edge being crossed
  // For horizontal movement (dx=1, dy=0): crosses vertical edge at x=fromX+1
  // For vertical movement (dx=0, dy=1): crosses horizontal edge at y=fromY+1
  // For diagonal movement: crosses both edges

  if (dx !== 0 && dy === 0) {
    // Horizontal movement — check vertical wall edges
    const edgeX = dx > 0 ? fromX + 1 : fromX
    return isVerticalWallAtEdge(edgeX, fromY, wall)
  }

  if (dy !== 0 && dx === 0) {
    // Vertical movement — check horizontal wall edges
    const edgeY = dy > 0 ? fromY + 1 : fromY
    return isHorizontalWallAtEdge(fromX, edgeY, wall)
  }

  // Diagonal movement — blocked if wall blocks EITHER adjacent cardinal direction
  // (i.e., wall at the corner blocks diagonal movement through that corner)
  const edgeX = dx > 0 ? fromX + 1 : fromX
  const edgeY = dy > 0 ? fromY + 1 : fromY

  if (isVerticalWallAtEdge(edgeX, fromY, wall)) return true
  if (isVerticalWallAtEdge(edgeX, fromY + dy, wall)) return true
  if (isHorizontalWallAtEdge(fromX, edgeY, wall)) return true
  if (isHorizontalWallAtEdge(fromX + dx, edgeY, wall)) return true

  return false
}

/** Check if a vertical wall segment covers the edge at grid x, row y */
function isVerticalWallAtEdge(edgeX: number, cellY: number, wall: WallSegment): boolean {
  // Vertical wall: x1 == x2 == edgeX, spans y range that includes cellY to cellY+1
  if (wall.x1 !== wall.x2) return false
  if (wall.x1 !== edgeX) return false
  const minY = Math.min(wall.y1, wall.y2)
  const maxY = Math.max(wall.y1, wall.y2)
  return minY <= cellY && maxY >= cellY + 1
}

/** Check if a horizontal wall segment covers the edge at grid y, column x */
function isHorizontalWallAtEdge(cellX: number, edgeY: number, wall: WallSegment): boolean {
  // Horizontal wall: y1 == y2 == edgeY, spans x range that includes cellX to cellX+1
  if (wall.y1 !== wall.y2) return false
  if (wall.y1 !== edgeY) return false
  const minX = Math.min(wall.x1, wall.x2)
  const maxX = Math.max(wall.x1, wall.x2)
  return minX <= cellX && maxX >= cellX + 1
}

/**
 * Heuristic for A* pathfinding.
 * Standard: Chebyshev (all diagonals = 5ft).
 * Alternate: uses octile distance (diag pairs cost 15ft per 2 diags).
 */
function heuristic(x1: number, y1: number, x2: number, y2: number, diagonalRule: DiagonalRule = 'standard'): number {
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  if (diagonalRule === 'alternate') {
    const diag = Math.min(dx, dy)
    const straight = Math.max(dx, dy) - diag
    // Average diagonal cost is 7.5ft but we use a consistent admissible heuristic
    const fullPairs = Math.floor(diag / 2)
    const remainder = diag % 2
    return fullPairs * 15 + remainder * 5 + straight * 5
  }
  return Math.max(dx, dy) * 5
}

/**
 * Calculate movement cost for a single step, considering terrain and diagonal rule.
 */
function stepCost(toX: number, toY: number, terrain: TerrainCell[], tokenSpeeds?: TokenSpeeds, baseCost = 5): number {
  const cell = terrain.find((t) => t.x === toX && t.y === toY)
  if (!cell) return baseCost

  if (cell.type === 'water') {
    return tokenSpeeds?.hasSwimSpeed ? baseCost : baseCost * 2
  }
  if (cell.type === 'climbing') {
    return tokenSpeeds?.hasClimbSpeed ? baseCost : baseCost * 2
  }
  if (cell.movementCost > 1) {
    return baseCost * cell.movementCost
  }
  return baseCost
}

/**
 * Get hex neighbors for a given cell. Hex grids have 6 neighbors.
 * For flat-top hexes: odd columns are offset down.
 * For pointy-top hexes: odd rows are offset right.
 */
function getHexNeighbors(x: number, y: number, gridType: GridType): Array<{ dx: number; dy: number }> {
  if (gridType === 'hex' || gridType === 'hex-flat') {
    // Flat-top hex: odd columns offset down
    if (x % 2 === 0) {
      return [
        { dx: 1, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: -1, dy: -1 },
        { dx: 0, dy: -1 }
      ]
    }
    return [
      { dx: 1, dy: 0 },
      { dx: 1, dy: 1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ]
  }
  // Pointy-top hex: odd rows offset right
  if (y % 2 === 0) {
    return [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: -1 }
    ]
  }
  return [
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: -1 }
  ]
}

function isHexGrid(gridType?: GridType): boolean {
  return gridType === 'hex' || gridType === 'hex-flat' || gridType === 'hex-pointy'
}

/**
 * Find the shortest path from start to goal using A* with wall blocking.
 *
 * @param startX - Starting grid X
 * @param startY - Starting grid Y
 * @param goalX - Target grid X
 * @param goalY - Target grid Y
 * @param gridWidth - Grid width in cells
 * @param gridHeight - Grid height in cells
 * @param walls - Wall segments that block movement
 * @param terrain - Terrain cells affecting movement cost
 * @param movementBudget - Maximum movement in feet (0 = unlimited)
 * @param tokenSpeeds - Token swim/climb speed capabilities
 */
export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  gridWidth: number,
  gridHeight: number,
  walls: WallSegment[],
  terrain: TerrainCell[],
  movementBudget = 0,
  tokenSpeeds?: TokenSpeeds,
  diagonalRule: DiagonalRule = 'standard',
  gridType?: GridType
): PathResult {
  if (startX === goalX && startY === goalY) {
    return { path: [{ x: startX, y: startY }], totalCost: 0, reachedGoal: true }
  }

  const open = new Map<string, PathNode>()
  const closed = new Set<string>()

  const startNode: PathNode = {
    x: startX,
    y: startY,
    g: 0,
    f: heuristic(startX, startY, goalX, goalY, diagonalRule),
    parent: null,
    diagCount: 0
  }
  open.set(`${startX},${startY}`, startNode)

  while (open.size > 0) {
    // Find node with lowest f score
    let current: PathNode | null = null
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node
    }
    if (!current) break

    const key = `${current.x},${current.y}`
    open.delete(key)
    closed.add(key)

    // Goal reached
    if (current.x === goalX && current.y === goalY) {
      return buildResult(current, true)
    }

    // Explore neighbors (8 for square, 6 for hex)
    const hexMode = isHexGrid(gridType)
    const neighbors = hexMode
      ? getHexNeighbors(current.x, current.y, gridType!)
      : [
          { dx: -1, dy: -1 },
          { dx: -1, dy: 0 },
          { dx: -1, dy: 1 },
          { dx: 0, dy: -1 },
          { dx: 0, dy: 1 },
          { dx: 1, dy: -1 },
          { dx: 1, dy: 0 },
          { dx: 1, dy: 1 }
        ]

    for (const { dx, dy } of neighbors) {
      const nx = current.x + dx
      const ny = current.y + dy

      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue

      const nKey = `${nx},${ny}`
      if (closed.has(nKey)) continue

      // Check wall blocking
      if (isMovementBlockedByWall(current.x, current.y, nx, ny, walls)) continue

      // Hex grids have no diagonals — all moves cost 5ft
      const isDiagonal = !hexMode && dx !== 0 && dy !== 0
      let newDiagCount = current.diagCount
      let baseCost = 5
      if (isDiagonal && diagonalRule === 'alternate') {
        newDiagCount++
        baseCost = newDiagCount % 2 === 0 ? 10 : 5
      }

      const cost = stepCost(nx, ny, terrain, tokenSpeeds, baseCost)
      const newG = current.g + cost

      // Enforce movement budget
      if (movementBudget > 0 && newG > movementBudget) continue

      const existing = open.get(nKey)
      if (existing && existing.g <= newG) continue

      const node: PathNode = {
        x: nx,
        y: ny,
        g: newG,
        f: newG + heuristic(nx, ny, goalX, goalY, diagonalRule),
        parent: current,
        diagCount: newDiagCount
      }
      open.set(nKey, node)
    }
  }

  // Goal not reachable — return empty path
  return { path: [], totalCost: 0, reachedGoal: false }
}

function buildResult(endNode: PathNode, reachedGoal: boolean): PathResult {
  const path: Array<{ x: number; y: number }> = []
  let node: PathNode | null = endNode
  while (node) {
    path.unshift({ x: node.x, y: node.y })
    node = node.parent
  }
  return { path, totalCost: endNode.g, reachedGoal }
}

/**
 * Get all cells reachable within movement budget, respecting walls.
 * Enhanced version of combat-rules.getReachableCells with wall awareness.
 */
export function getReachableCellsWithWalls(
  startX: number,
  startY: number,
  movementBudget: number,
  terrain: TerrainCell[],
  gridWidth: number,
  gridHeight: number,
  walls: WallSegment[],
  tokenSpeeds?: TokenSpeeds,
  diagonalRule: DiagonalRule = 'standard',
  gridType?: GridType
): Array<{ x: number; y: number; cost: number }> {
  const reachable: Array<{ x: number; y: number; cost: number }> = []
  const visited = new Map<string, number>()
  const queue: Array<{ x: number; y: number; costSoFar: number; diagCount: number }> = [
    { x: startX, y: startY, costSoFar: 0, diagCount: 0 }
  ]
  visited.set(`${startX},${startY}`, 0)
  const hexMode = isHexGrid(gridType)

  while (queue.length > 0) {
    const { x, y, costSoFar, diagCount } = queue.shift()!

    const neighbors = hexMode
      ? getHexNeighbors(x, y, gridType!)
      : [
          { dx: -1, dy: -1 },
          { dx: -1, dy: 0 },
          { dx: -1, dy: 1 },
          { dx: 0, dy: -1 },
          { dx: 0, dy: 1 },
          { dx: 1, dy: -1 },
          { dx: 1, dy: 0 },
          { dx: 1, dy: 1 }
        ]

    for (const { dx, dy } of neighbors) {
      const nx = x + dx
      const ny = y + dy

      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue

      // Check wall blocking
      if (isMovementBlockedByWall(x, y, nx, ny, walls)) continue

      const isDiagonal = !hexMode && dx !== 0 && dy !== 0
      let newDiagCount = diagCount
      let baseCost = 5
      if (isDiagonal && diagonalRule === 'alternate') {
        newDiagCount++
        baseCost = newDiagCount % 2 === 0 ? 10 : 5
      }

      const cost = stepCost(nx, ny, terrain, tokenSpeeds, baseCost)
      const totalCost = costSoFar + cost

      if (totalCost > movementBudget) continue

      const key = `${nx},${ny}`
      const existingCost = visited.get(key)
      if (existingCost !== undefined && existingCost <= totalCost) continue

      visited.set(key, totalCost)
      reachable.push({ x: nx, y: ny, cost: totalCost })
      queue.push({ x: nx, y: ny, costSoFar: totalCost, diagCount: newDiagCount })
    }
  }

  return reachable
}
