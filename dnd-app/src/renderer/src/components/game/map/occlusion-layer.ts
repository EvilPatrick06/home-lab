/**
 * OcclusionLayer — Renders foreground/occlusion tiles above the token layer.
 *
 * When `fadeOnProximity` is enabled on a tile, its alpha is reduced as party
 * tokens approach, creating a see-through effect (e.g. rooftops that fade
 * when players walk underneath).
 */

import { Assets, type Container, Sprite, type Texture } from 'pixi.js'
import type { MapToken, OcclusionTile } from '../../../types/map'
import { logger } from '../../../utils/logger'

/** Cache of loaded sprites keyed by occlusion tile id */
const spriteCache = new Map<string, { sprite: Sprite; key: string }>()

/**
 * Update the occlusion layer: load/remove sprites, update positions and
 * proximity-based alpha values.
 *
 * @param container     PixiJS Container for occlusion sprites
 * @param tiles         Occlusion tiles on the current map
 * @param partyTokens   Player tokens used for proximity fade
 * @param cellSize      Grid cell size in pixels
 * @param currentFloor  Currently viewed floor index
 */
export function updateOcclusionLayer(
  container: Container,
  tiles: OcclusionTile[],
  partyTokens: MapToken[],
  cellSize: number,
  currentFloor: number
): void {
  const activeTileIds = new Set<string>()

  for (const tile of tiles) {
    const tileFloor = tile.floor ?? 0
    if (tileFloor !== currentFloor) continue

    activeTileIds.add(tile.id)
    const key = `${tile.imagePath},${tile.x},${tile.y},${tile.width},${tile.height}`
    const cached = spriteCache.get(tile.id)

    if (cached && cached.key === key) {
      // Update alpha based on proximity
      cached.sprite.alpha = computeOcclusionAlpha(tile, partyTokens, cellSize)
      continue
    }

    // Remove old sprite if exists
    if (cached) {
      container.removeChild(cached.sprite)
      cached.sprite.destroy({ children: true })
      spriteCache.delete(tile.id)
    }

    // Load new sprite asynchronously
    loadOcclusionSprite(container, tile, partyTokens, cellSize, key)
  }

  // Remove sprites for tiles no longer present
  for (const [tileId, entry] of spriteCache) {
    if (!activeTileIds.has(tileId)) {
      container.removeChild(entry.sprite)
      entry.sprite.destroy({ children: true })
      spriteCache.delete(tileId)
    }
  }
}

async function loadOcclusionSprite(
  container: Container,
  tile: OcclusionTile,
  partyTokens: MapToken[],
  cellSize: number,
  key: string
): Promise<void> {
  try {
    const texture: Texture = await Assets.load(tile.imagePath)
    const sprite = new Sprite(texture)
    sprite.label = `occlusion-${tile.id}`
    sprite.x = tile.x
    sprite.y = tile.y
    sprite.width = tile.width
    sprite.height = tile.height
    sprite.alpha = computeOcclusionAlpha(tile, partyTokens, cellSize)

    container.addChild(sprite)
    spriteCache.set(tile.id, { sprite, key })
  } catch (err) {
    logger.warn(`[OcclusionLayer] Failed to load occlusion tile image: ${tile.imagePath}`, err)
  }
}

/**
 * Compute the alpha value for an occlusion tile based on proximity to party tokens.
 *
 * When `fadeOnProximity` is false, always returns 1 (fully opaque).
 * When true, alpha ranges from 1 (at fadeRadius edge) to 0 (at tile center).
 */
function computeOcclusionAlpha(tile: OcclusionTile, partyTokens: MapToken[], cellSize: number): number {
  if (!tile.fadeOnProximity || partyTokens.length === 0) return 1

  const tileCenterX = tile.x + tile.width / 2
  const tileCenterY = tile.y + tile.height / 2
  const fadeRadiusPx = tile.fadeRadius * cellSize

  if (fadeRadiusPx <= 0) return 1

  let minDist = Infinity

  for (const token of partyTokens) {
    const tokenCenterX = (token.gridX + token.sizeX / 2) * cellSize
    const tokenCenterY = (token.gridY + token.sizeY / 2) * cellSize
    const dx = tokenCenterX - tileCenterX
    const dy = tokenCenterY - tileCenterY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < minDist) minDist = dist
  }

  if (minDist >= fadeRadiusPx) return 1
  // Linear interpolation: 0 at center, 1 at edge
  return Math.max(0, minDist / fadeRadiusPx)
}

/**
 * Clear all occlusion sprites and the internal cache.
 */
export function clearOcclusionLayer(container: Container): void {
  for (const [, entry] of spriteCache) {
    container.removeChild(entry.sprite)
    entry.sprite.destroy({ children: true })
  }
  spriteCache.clear()
}
