/**
 * Sound occlusion utilities — calculate sound attenuation based on walls and distance.
 * Uses raycast visibility algorithms to determine line-of-sight between sound source and listener.
 */

import type { GameMap, MapToken, WallSegment } from '../../types/map'
import type { Point, Segment } from './raycast-visibility'
import { wallsToSegments } from './raycast-visibility'

// ─── Constants ────────────────────────────────────────────────────

/** Sound occlusion factors */
export const SOUND_OCCLUSION = {
  /** Volume multiplier when sound is completely occluded */
  OCCLUDED_VOLUME_MULTIPLIER: 0.1,
  /** Low-pass filter frequency cutoff when occluded (Hz) */
  OCCLUDED_LOW_PASS_FREQ: 800,
  /** Normal low-pass filter frequency (no occlusion) */
  NORMAL_LOW_PASS_FREQ: 22000,
  /** Distance falloff exponent (1 = linear, 2 = inverse square, etc.) */
  DISTANCE_FALLOFF_EXPONENT: 1.5,
  /** Minimum volume threshold (below this, sound is muted) */
  MIN_VOLUME_THRESHOLD: 0.01
} as const

// ─── Types ─────────────────────────────────────────────────────────

export interface SoundOcclusionResult {
  /** Final volume multiplier (0-1) accounting for distance and occlusion */
  volume: number
  /** Whether sound is occluded by walls */
  isOccluded: boolean
  /** Low-pass filter frequency (Hz) for muffling effect */
  lowPassFrequency: number
  /** Distance from emitter to listener in grid cells */
  distance: number
}

// ─── Core sound occlusion calculation ──────────────────────────────

/**
 * Calculate sound occlusion and volume attenuation between an emitter and listener.
 *
 * @param emitterX Grid X position of sound emitter
 * @param emitterY Grid Y position of sound emitter
 * @param listenerX Grid X position of listener (player token)
 * @param listenerY Grid Y position of listener (player token)
 * @param map Game map containing walls and grid settings
 * @param baseVolume Base volume from emitter (0-1)
 * @param maxRadius Maximum audible radius in grid cells
 * @returns Sound occlusion result with volume and filter settings
 */
export function calculateSoundOcclusion(
  emitterX: number,
  emitterY: number,
  listenerX: number,
  listenerY: number,
  map: GameMap,
  baseVolume: number,
  maxRadius: number
): SoundOcclusionResult {
  const cellSize = map.grid.cellSize

  // Calculate distance in grid cells
  const dx = emitterX + 0.5 - (listenerX + 0.5) // Center of grid cells
  const dy = emitterY + 0.5 - (listenerY + 0.5)
  const distance = Math.sqrt(dx * dx + dy * dy)

  // If beyond max radius, completely silent
  if (distance >= maxRadius) {
    return {
      volume: 0,
      isOccluded: false,
      lowPassFrequency: SOUND_OCCLUSION.NORMAL_LOW_PASS_FREQ,
      distance
    }
  }

  // Calculate distance-based volume falloff
  const distanceFactor = 1 - Math.pow(distance / maxRadius, SOUND_OCCLUSION.DISTANCE_FALLOFF_EXPONENT)
  let volume = baseVolume * Math.max(0, distanceFactor)

  // Check for wall occlusion
  const isOccluded = checkWallOcclusion(
    { x: emitterX + 0.5, y: emitterY + 0.5 },
    { x: listenerX + 0.5, y: listenerY + 0.5 },
    map.wallSegments ?? [],
    cellSize
  )

  // Apply occlusion effects
  if (isOccluded) {
    volume *= SOUND_OCCLUSION.OCCLUDED_VOLUME_MULTIPLIER
  }

  // Apply minimum volume threshold
  if (volume < SOUND_OCCLUSION.MIN_VOLUME_THRESHOLD) {
    volume = 0
  }

  return {
    volume,
    isOccluded,
    lowPassFrequency: isOccluded
      ? SOUND_OCCLUSION.OCCLUDED_LOW_PASS_FREQ
      : SOUND_OCCLUSION.NORMAL_LOW_PASS_FREQ,
    distance
  }
}

/**
 * Check if there are walls blocking line-of-sight between two points.
 * Uses raycast algorithm to detect wall intersections.
 *
 * @param emitter Grid position of sound emitter
 * @param listener Grid position of listener
 * @param walls Wall segments on the map
 * @param cellSize Size of each grid cell in pixels
 * @returns true if sound is occluded by walls
 */
export function checkWallOcclusion(
  emitter: Point,
  listener: Point,
  walls: WallSegment[],
  cellSize: number
): boolean {
  // Convert grid positions to pixel coordinates
  const emitterPx: Point = {
    x: emitter.x * cellSize,
    y: emitter.y * cellSize
  }
  const listenerPx: Point = {
    x: listener.x * cellSize,
    y: listener.y * cellSize
  }

  // Convert walls to segments (only solid walls and closed doors block sound)
  const segments: Segment[] = walls
    .filter(wall => wall.type === 'solid' || (wall.type === 'door' && wall.isOpen === false))
    .map(wall => ({
      a: { x: wall.x1 * cellSize, y: wall.y1 * cellSize },
      b: { x: wall.x2 * cellSize, y: wall.y2 * cellSize },
      type: wall.type,
      isOpen: wall.isOpen
    }))

  // Check for line intersection with any wall segment
  const dx = listenerPx.x - emitterPx.x
  const dy = listenerPx.y - emitterPx.y

  for (const segment of segments) {
    if (lineIntersectsLine(emitterPx, listenerPx, segment.a, segment.b)) {
      return true // Sound is occluded
    }
  }

  return false // Line of sight is clear
}

/**
 * Check if two line segments intersect.
 * Uses the standard line intersection algorithm.
 */
function lineIntersectsLine(
  a: Point, b: Point, // First line segment
  c: Point, d: Point  // Second line segment
): boolean {
  const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)
  if (Math.abs(denom) < 0.0001) return false // Lines are parallel

  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom
  const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denom

  // Check if intersection point is within both line segments
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

/**
 * Get the current player's position for sound listener calculations.
 * Uses the first player token found on the map.
 */
export function getPlayerListenerPosition(map: GameMap): Point | null {
  const playerToken = map.tokens.find(token => token.entityType === 'player')
  if (!playerToken) return null

  return {
    x: playerToken.gridX + playerToken.sizeX / 2, // Center of token
    y: playerToken.gridY + playerToken.sizeY / 2
  }
}

/**
 * Calculate occlusion-aware volume for all active audio emitters from a listener's perspective.
 */
export function calculateEmitterVolumes(
  emitters: Array<{ id: string; x: number; y: number; volume: number; radius: number }>,
  listener: Point,
  map: GameMap
): Map<string, SoundOcclusionResult> {
  const results = new Map<string, SoundOcclusionResult>()

  for (const emitter of emitters) {
    const occlusion = calculateSoundOcclusion(
      emitter.x,
      emitter.y,
      listener.x,
      listener.y,
      map,
      emitter.volume,
      emitter.radius
    )
    results.set(emitter.id, occlusion)
  }

  return results
}