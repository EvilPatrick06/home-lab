import type { DrawingData, MapToken, TerrainCell, WallSegment } from '../../types/map'

export function getTokenFloor(token: MapToken): number {
  return token.floor ?? 0
}

export function filterTokensByFloor(tokens: MapToken[], floor: number): MapToken[] {
  return tokens.filter((t) => (t.floor ?? 0) === floor)
}

export function filterWallsByFloor(walls: WallSegment[], floor: number): WallSegment[] {
  return walls.filter((w) => (w.floor ?? 0) === floor)
}

export function filterTerrainByFloor(terrain: TerrainCell[], floor: number): TerrainCell[] {
  return terrain.filter((t) => (t.floor ?? 0) === floor)
}

export function filterDrawingsByFloor(drawings: DrawingData[], floor: number): DrawingData[] {
  return drawings.filter((d) => (d.floor ?? 0) === floor)
}

/**
 * Determine which floor a player should be viewing based on their character token.
 * Returns 0 (ground floor) if the token is not found.
 */
export function getPlayerFloor(tokens: MapToken[], playerEntityId: string | null | undefined): number {
  if (!playerEntityId) return 0
  const playerToken = tokens.find((t) => t.entityId === playerEntityId && t.entityType === 'player')
  return playerToken ? (playerToken.floor ?? 0) : 0
}
