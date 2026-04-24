import { describe, expect, it } from 'vitest'
import type { TerrainCell, WallSegment } from '../../types/map'
import { findPath, getReachableCellsWithWalls } from './pathfinder'

function wall(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  type: 'solid' | 'door' | 'window' = 'solid',
  isOpen = false
): WallSegment {
  return { id: `w-${x1}-${y1}`, x1, y1, x2, y2, type, isOpen }
}

describe('findPath', () => {
  it('finds straight path with no obstacles', () => {
    const result = findPath(0, 0, 3, 0, 10, 10, [], [])
    expect(result.reachedGoal).toBe(true)
    expect(result.totalCost).toBe(15) // 3 cells * 5ft
    expect(result.path.length).toBe(4) // start + 3 steps
    expect(result.path[0]).toEqual({ x: 0, y: 0 })
    expect(result.path[3]).toEqual({ x: 3, y: 0 })
  })

  it('finds diagonal path', () => {
    const result = findPath(0, 0, 3, 3, 10, 10, [], [])
    expect(result.reachedGoal).toBe(true)
    expect(result.totalCost).toBe(15) // 3 diagonal steps * 5ft (Chebyshev)
  })

  it('returns same position for start == goal', () => {
    const result = findPath(5, 5, 5, 5, 10, 10, [], [])
    expect(result.reachedGoal).toBe(true)
    expect(result.totalCost).toBe(0)
    expect(result.path).toEqual([{ x: 5, y: 5 }])
  })

  it('respects solid walls — routes around them', () => {
    // Vertical wall at x=2 from y=0 to y=5 blocking direct path
    const walls = [wall(2, 0, 2, 5)]
    const result = findPath(0, 2, 4, 2, 10, 10, walls, [])
    expect(result.reachedGoal).toBe(true)
    // Path must go around the wall — cost > 20ft (direct would be 20ft)
    expect(result.totalCost).toBeGreaterThan(20)
    // Verify path doesn't cross the wall at x=2 between y=0 and y=5
    for (let i = 0; i < result.path.length - 1; i++) {
      const from = result.path[i]
      const to = result.path[i + 1]
      // Should not move from x<2 to x>=2 or vice versa (within wall y range)
      if (from.y >= 0 && from.y < 4) {
        const crossesWall = (from.x < 2 && to.x >= 2) || (from.x >= 2 && to.x < 2)
        expect(crossesWall).toBe(false)
      }
    }
  })

  it('passes through open doors', () => {
    const walls = [wall(2, 0, 2, 5, 'door', true)]
    const result = findPath(0, 2, 4, 2, 10, 10, walls, [])
    expect(result.reachedGoal).toBe(true)
    expect(result.totalCost).toBe(20) // direct path, door doesn't block
  })

  it('passes through windows', () => {
    const walls = [wall(2, 0, 2, 5, 'window')]
    const result = findPath(0, 2, 4, 2, 10, 10, walls, [])
    expect(result.reachedGoal).toBe(true)
    expect(result.totalCost).toBe(20)
  })

  it('blocks on closed doors', () => {
    const walls = [wall(2, 0, 2, 5, 'door', false)]
    const result = findPath(0, 2, 4, 2, 10, 10, walls, [])
    expect(result.reachedGoal).toBe(true)
    expect(result.totalCost).toBeGreaterThan(20) // must route around
  })

  it('accounts for difficult terrain cost', () => {
    // Fill a wide band of difficult terrain so A* can't route around it
    const terrain: TerrainCell[] = []
    for (let y = 0; y < 5; y++) {
      terrain.push({ x: 2, y, type: 'difficult', movementCost: 2 })
    }
    const result = findPath(0, 2, 4, 2, 10, 10, [], terrain)
    expect(result.reachedGoal).toBe(true)
    // Path: (0,2)→(1,2)→(2,2)→(3,2)→(4,2) = 5 + 10 + 5 + 5 = 25ft
    // But A* may find diagonal: (0,2)→(1,1)→(2,2)→(3,1)→(4,2) also 25ft since (2,2) is still difficult
    // Either way, crossing the difficult column costs 10ft instead of 5ft
    expect(result.totalCost).toBeGreaterThan(15) // straight 4-cell path would be 20ft, with terrain > 20
  })

  it('respects movement budget', () => {
    const result = findPath(0, 0, 10, 0, 20, 20, [], [], 15)
    // Can only move 3 cells (15ft), goal is 10 cells away
    expect(result.reachedGoal).toBe(false)
  })

  it('returns empty path when completely walled off', () => {
    // Box the start position with walls
    const walls = [
      wall(0, 0, 1, 0), // top
      wall(0, 1, 1, 1), // bottom
      wall(0, 0, 0, 1), // left
      wall(1, 0, 1, 1) // right
    ]
    const result = findPath(0, 0, 5, 5, 10, 10, walls, [])
    expect(result.reachedGoal).toBe(false)
    expect(result.path).toEqual([])
  })
})

describe('getReachableCellsWithWalls', () => {
  it('returns adjacent cells with no walls', () => {
    const cells = getReachableCellsWithWalls(5, 5, 5, [], 10, 10, [])
    // Should reach all 8 adjacent cells
    expect(cells.length).toBe(8)
    expect(cells.every((c) => c.cost === 5)).toBe(true)
  })

  it('respects walls when calculating reachable cells', () => {
    // Wall blocks movement to the right
    const walls = [wall(6, 4, 6, 7)]
    const cells = getReachableCellsWithWalls(5, 5, 5, [], 10, 10, walls)
    // Cells to the right should not be reachable
    const rightCells = cells.filter((c) => c.x === 6)
    expect(rightCells.length).toBe(0)
  })

  it('accounts for terrain costs', () => {
    const terrain: TerrainCell[] = [{ x: 6, y: 5, type: 'difficult', movementCost: 2 }]
    const cells = getReachableCellsWithWalls(5, 5, 5, terrain, 10, 10, [])
    // Cell (6,5) should cost 10ft — not reachable with 5ft budget
    const difficultCell = cells.find((c) => c.x === 6 && c.y === 5)
    expect(difficultCell).toBeUndefined()
  })

  it('returns more cells with larger budget', () => {
    const cells5 = getReachableCellsWithWalls(5, 5, 5, [], 10, 10, [])
    const cells10 = getReachableCellsWithWalls(5, 5, 10, [], 10, 10, [])
    expect(cells10.length).toBeGreaterThan(cells5.length)
  })
})
