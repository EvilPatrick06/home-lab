import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerrainCell, WallSegment } from '../../../../types/map'
import {
  handleFillCellClick,
  handleFogBrushClick,
  handleTerrainCellClick,
  handleWallPlace
} from './map-editor-handlers'

// ─── Mocks ────────────────────────────────────────────────────

const mockMaps: { id: string; terrain: TerrainCell[]; wallSegments?: WallSegment[] }[] = []
const mockLoadGameState = vi.fn()
const mockRevealFog = vi.fn()
const mockHideFog = vi.fn()
const mockAddWallSegment = vi.fn()
const mockRemoveWallSegment = vi.fn()

vi.mock('../../../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      maps: mockMaps,
      loadGameState: mockLoadGameState,
      revealFog: mockRevealFog,
      hideFog: mockHideFog,
      addWallSegment: mockAddWallSegment,
      removeWallSegment: mockRemoveWallSegment
    }))
  }
}))

const mockUndoPush = vi.fn()
vi.mock('../../../../services/undo-manager', () => ({
  push: (...args: unknown[]) => mockUndoPush(...args)
}))

// ─── Helpers ──────────────────────────────────────────────────

const MAP_ID = 'map-1'

function makeTerrainCell(overrides: Partial<TerrainCell> = {}): TerrainCell {
  return { x: 0, y: 0, type: 'difficult', movementCost: 2, ...overrides }
}

// ─── handleTerrainCellClick ───────────────────────────────────

describe('handleTerrainCellClick', () => {
  beforeEach(() => {
    mockMaps.length = 0
    mockMaps.push({ id: MAP_ID, terrain: [] })
    mockLoadGameState.mockClear()
    mockUndoPush.mockClear()
  })

  it('returns true (indicating click was handled)', () => {
    const result = handleTerrainCellClick(MAP_ID, 1, 2, [], 'difficult', vi.fn())
    expect(result).toBe(true)
  })

  it('adds a new terrain cell when none exists at the position', () => {
    const triggerRerender = vi.fn()
    handleTerrainCellClick(MAP_ID, 1, 2, [], 'difficult', triggerRerender)
    const newMaps = mockLoadGameState.mock.calls[0][0].maps
    const newTerrain = newMaps.find((m: { id: string }) => m.id === MAP_ID)?.terrain
    expect(newTerrain).toContainEqual(expect.objectContaining({ x: 1, y: 2, type: 'difficult' }))
  })

  it('removes an existing terrain cell when one exists at the position (toggle)', () => {
    const existing = makeTerrainCell({ x: 1, y: 2 })
    const triggerRerender = vi.fn()
    handleTerrainCellClick(MAP_ID, 1, 2, [existing], 'difficult', triggerRerender)
    const newMaps = mockLoadGameState.mock.calls[0][0].maps
    const newTerrain = newMaps.find((m: { id: string }) => m.id === MAP_ID)?.terrain
    expect(newTerrain).not.toContainEqual(expect.objectContaining({ x: 1, y: 2 }))
  })

  it('floors fractional coordinates', () => {
    const triggerRerender = vi.fn()
    handleTerrainCellClick(MAP_ID, 1.9, 2.7, [], 'water', triggerRerender)
    const newMaps = mockLoadGameState.mock.calls[0][0].maps
    const newTerrain = newMaps.find((m: { id: string }) => m.id === MAP_ID)?.terrain
    expect(newTerrain).toContainEqual(expect.objectContaining({ x: 1, y: 2 }))
  })

  it('assigns movementCost=1 for hazard terrain', () => {
    handleTerrainCellClick(MAP_ID, 0, 0, [], 'hazard', vi.fn())
    const newMaps = mockLoadGameState.mock.calls[0][0].maps
    const newTerrain = newMaps.find((m: { id: string }) => m.id === MAP_ID)?.terrain
    expect(newTerrain[0].movementCost).toBe(1)
  })

  it('assigns movementCost=2 for non-hazard terrain', () => {
    handleTerrainCellClick(MAP_ID, 0, 0, [], 'difficult', vi.fn())
    const newMaps = mockLoadGameState.mock.calls[0][0].maps
    const newTerrain = newMaps.find((m: { id: string }) => m.id === MAP_ID)?.terrain
    expect(newTerrain[0].movementCost).toBe(2)
  })

  it('calls triggerRerender', () => {
    const triggerRerender = vi.fn()
    handleTerrainCellClick(MAP_ID, 0, 0, [], 'difficult', triggerRerender)
    expect(triggerRerender).toHaveBeenCalledOnce()
  })

  it('pushes an undo action', () => {
    handleTerrainCellClick(MAP_ID, 0, 0, [], 'difficult', vi.fn())
    expect(mockUndoPush).toHaveBeenCalled()
    const entry = mockUndoPush.mock.calls[0][0]
    expect(entry.type).toBe('terrain-paint')
    expect(entry).toHaveProperty('undo')
    expect(entry).toHaveProperty('redo')
  })
})

// ─── handleFillCellClick ──────────────────────────────────────

describe('handleFillCellClick', () => {
  beforeEach(() => {
    mockMaps.length = 0
    mockMaps.push({ id: MAP_ID, terrain: [] })
    mockLoadGameState.mockClear()
    mockUndoPush.mockClear()
  })

  it('returns true (indicating click was handled)', () => {
    const result = handleFillCellClick(MAP_ID, 700, 700, 70, 0, 0, [], 'difficult', vi.fn())
    expect(result).toBe(true)
  })

  it('flood-fills empty cells outward from start point (up to maxFill)', () => {
    handleFillCellClick(MAP_ID, 1400, 700, 70, 5, 5, [], 'water', vi.fn())
    const newMaps = mockLoadGameState.mock.calls[0][0].maps
    const newTerrain = newMaps.find((m: { id: string }) => m.id === MAP_ID)?.terrain
    expect(newTerrain.length).toBeGreaterThan(0)
  })

  it('removes a flood-fill region when clicking on existing terrain', () => {
    // Existing terrain cell at (0,0)
    const existing: TerrainCell[] = [makeTerrainCell({ x: 0, y: 0, type: 'water' })]
    handleFillCellClick(MAP_ID, 700, 700, 70, 0, 0, existing, 'water', vi.fn())
    const newMaps = mockLoadGameState.mock.calls[0][0].maps
    const newTerrain = newMaps.find((m: { id: string }) => m.id === MAP_ID)?.terrain
    // The existing cell should be removed
    expect(newTerrain.some((t: TerrainCell) => t.x === 0 && t.y === 0)).toBe(false)
  })

  it('pushes an undo action on fill', () => {
    handleFillCellClick(MAP_ID, 700, 700, 70, 0, 0, [], 'difficult', vi.fn())
    expect(mockUndoPush).toHaveBeenCalled()
  })

  it('pushes a terrain-fill-remove undo action when removing', () => {
    const existing: TerrainCell[] = [makeTerrainCell({ x: 0, y: 0, type: 'difficult' })]
    handleFillCellClick(MAP_ID, 700, 700, 70, 0, 0, existing, 'difficult', vi.fn())
    const entry = mockUndoPush.mock.calls[0][0]
    expect(entry.type).toBe('terrain-fill-remove')
  })

  it('calls triggerRerender after fill', () => {
    const triggerRerender = vi.fn()
    handleFillCellClick(MAP_ID, 700, 700, 70, 0, 0, [], 'difficult', triggerRerender)
    expect(triggerRerender).toHaveBeenCalledOnce()
  })
})

// ─── handleFogBrushClick ──────────────────────────────────────

describe('handleFogBrushClick', () => {
  beforeEach(() => {
    mockRevealFog.mockClear()
    mockHideFog.mockClear()
  })

  it('calls revealFog when activeTool is "fog-reveal"', () => {
    handleFogBrushClick('fog-reveal', MAP_ID, 5, 5, 1)
    expect(mockRevealFog).toHaveBeenCalledOnce()
    expect(mockHideFog).not.toHaveBeenCalled()
  })

  it('calls hideFog when activeTool is "fog-hide"', () => {
    handleFogBrushClick('fog-hide', MAP_ID, 5, 5, 1)
    expect(mockHideFog).toHaveBeenCalledOnce()
    expect(mockRevealFog).not.toHaveBeenCalled()
  })

  it('passes the correct mapId', () => {
    handleFogBrushClick('fog-reveal', 'custom-map', 5, 5, 1)
    expect(mockRevealFog).toHaveBeenCalledWith('custom-map', expect.any(Array))
  })

  it('generates a 1x1 brush area for brushSize=1', () => {
    handleFogBrushClick('fog-reveal', MAP_ID, 5, 5, 1)
    const cells = mockRevealFog.mock.calls[0][1]
    expect(cells).toHaveLength(1)
    expect(cells[0]).toEqual({ x: 5, y: 5 })
  })

  it('generates a 3x3 brush area for brushSize=3', () => {
    handleFogBrushClick('fog-reveal', MAP_ID, 5, 5, 3)
    const cells = mockRevealFog.mock.calls[0][1]
    expect(cells).toHaveLength(9)
  })

  it('generates a 5x5 brush area for brushSize=5', () => {
    handleFogBrushClick('fog-reveal', MAP_ID, 5, 5, 5)
    const cells = mockRevealFog.mock.calls[0][1]
    expect(cells).toHaveLength(25)
  })

  it('centers the brush on the provided grid coordinates', () => {
    handleFogBrushClick('fog-reveal', MAP_ID, 3, 3, 3)
    const cells = mockRevealFog.mock.calls[0][1]
    const xs = cells.map((c: { x: number }) => c.x)
    const ys = cells.map((c: { y: number }) => c.y)
    expect(Math.min(...xs)).toBe(2)
    expect(Math.max(...xs)).toBe(4)
    expect(Math.min(...ys)).toBe(2)
    expect(Math.max(...ys)).toBe(4)
  })
})

// ─── handleWallPlace ──────────────────────────────────────────

describe('handleWallPlace', () => {
  beforeEach(() => {
    mockAddWallSegment.mockClear()
    mockRemoveWallSegment.mockClear()
    mockUndoPush.mockClear()
  })

  it('calls addWallSegment with the placed wall', () => {
    handleWallPlace(MAP_ID, 0, 0, 2, 0, [], vi.fn())
    expect(mockAddWallSegment).toHaveBeenCalledOnce()
    const [mapId, wall] = mockAddWallSegment.mock.calls[0]
    expect(mapId).toBe(MAP_ID)
    expect(wall.x1).toBe(0)
    expect(wall.y1).toBe(0)
    expect(wall.x2).toBe(2)
    expect(wall.y2).toBe(0)
  })

  it('creates a wall with type "solid" and isOpen=false', () => {
    handleWallPlace(MAP_ID, 0, 0, 1, 1, [], vi.fn())
    const wall = mockAddWallSegment.mock.calls[0][1]
    expect(wall.type).toBe('solid')
    expect(wall.isOpen).toBe(false)
  })

  it('generates a unique uuid for the wall id', () => {
    handleWallPlace(MAP_ID, 0, 0, 1, 0, [], vi.fn())
    handleWallPlace(MAP_ID, 1, 0, 2, 0, [], vi.fn())
    const id1 = mockAddWallSegment.mock.calls[0][1].id
    const id2 = mockAddWallSegment.mock.calls[1][1].id
    expect(id1).not.toBe(id2)
  })

  it('snaps endpoint to nearest existing wall start when within threshold', () => {
    // Existing wall: x1=0,y1=0 → x2=2,y2=0
    // Place new wall ending at (0.3, 0.1) — within 0.5 of (0,0)
    const existing: WallSegment[] = [{ id: 'w1', x1: 0, y1: 0, x2: 2, y2: 0, type: 'solid', isOpen: false }]
    handleWallPlace(MAP_ID, 2, 0, 0.3, 0.1, existing, vi.fn())
    const wall = mockAddWallSegment.mock.calls[0][1]
    expect(wall.x2).toBe(0)
    expect(wall.y2).toBe(0)
  })

  it('does not snap when endpoint is outside threshold', () => {
    const existing: WallSegment[] = [{ id: 'w1', x1: 0, y1: 0, x2: 2, y2: 0, type: 'solid', isOpen: false }]
    handleWallPlace(MAP_ID, 3, 0, 5, 5, existing, vi.fn())
    const wall = mockAddWallSegment.mock.calls[0][1]
    expect(wall.x2).toBe(5)
    expect(wall.y2).toBe(5)
  })

  it('pushes an undo action', () => {
    handleWallPlace(MAP_ID, 0, 0, 2, 0, [], vi.fn())
    expect(mockUndoPush).toHaveBeenCalled()
    const entry = mockUndoPush.mock.calls[0][0]
    expect(entry.type).toBe('wall-place')
    expect(entry).toHaveProperty('undo')
    expect(entry).toHaveProperty('redo')
  })

  it('calls triggerRerender after placing', () => {
    const triggerRerender = vi.fn()
    handleWallPlace(MAP_ID, 0, 0, 1, 0, [], triggerRerender)
    expect(triggerRerender).toHaveBeenCalledOnce()
  })
})
