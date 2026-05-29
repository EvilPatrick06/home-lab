import type { GameMap } from '../../types/map'

/** Phase 16f — hard cap on preloaded adjacent-map textures, to keep GPU memory bounded. */
export const MAX_PRELOAD_MAPS = 3

/**
 * Phase 16f — collect the image paths of maps reachable from the current map via `portal`
 * terrain cells, so their textures can be preloaded and the scene switch has no asset-load
 * stutter. Pure (no I/O) so it's unit-testable; the caller does the `Assets.load`.
 *
 * Dedupes by path, skips the current map + portals with no/unknown target or no imagePath, and
 * caps the result at `MAX_PRELOAD_MAPS`.
 */
export function collectPreloadImagePaths(currentMap: GameMap, allMaps: GameMap[]): string[] {
  const byId = new Map(allMaps.map((m) => [m.id, m]))
  const seen = new Set<string>()
  const out: string[] = []
  for (const cell of currentMap.terrain ?? []) {
    if (cell.type !== 'portal' || !cell.portalTarget) continue
    const target = byId.get(cell.portalTarget.mapId)
    if (!target || target.id === currentMap.id || !target.imagePath) continue
    if (seen.has(target.imagePath)) continue
    seen.add(target.imagePath)
    out.push(target.imagePath)
    if (out.length >= MAX_PRELOAD_MAPS) break
  }
  return out
}
