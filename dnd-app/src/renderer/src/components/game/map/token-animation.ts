/**
 * Token animation utility — smooth movement interpolation for map tokens.
 * Uses PixiJS ticker for frame-by-frame position updates.
 */

import type { Application, Container } from 'pixi.js'

const MOVE_DURATION_MS = 300

interface ActiveAnimation {
  sprite: Container
  startX: number
  startY: number
  endX: number
  endY: number
  startTime: number
  duration: number
  onComplete?: () => void
}

const activeAnimations = new Map<string, ActiveAnimation>()
let tickerBound = false
let appRef: Application | null = null

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function tick(): void {
  const now = performance.now()
  for (const [id, anim] of activeAnimations) {
    const elapsed = now - anim.startTime
    const progress = Math.min(elapsed / anim.duration, 1)
    const eased = easeOutCubic(progress)

    anim.sprite.x = anim.startX + (anim.endX - anim.startX) * eased
    anim.sprite.y = anim.startY + (anim.endY - anim.startY) * eased

    if (progress >= 1) {
      anim.sprite.x = anim.endX
      anim.sprite.y = anim.endY
      activeAnimations.delete(id)
      anim.onComplete?.()
    }
  }
}

function ensureTicker(app: Application): void {
  if (tickerBound && appRef === app) return
  if (appRef && appRef !== app) {
    appRef.ticker.remove(tick)
  }
  app.ticker.add(tick)
  appRef = app
  tickerBound = true
}

/**
 * Animate a token sprite from its current position to a new position.
 * If the sprite is already being animated, the current animation is replaced.
 */
export function animateTokenMove(
  app: Application,
  tokenId: string,
  sprite: Container,
  targetX: number,
  targetY: number,
  duration = MOVE_DURATION_MS,
  onComplete?: () => void
): void {
  ensureTicker(app)

  // Cancel any existing animation for this token
  activeAnimations.delete(tokenId)

  activeAnimations.set(tokenId, {
    sprite,
    startX: sprite.x,
    startY: sprite.y,
    endX: targetX,
    endY: targetY,
    startTime: performance.now(),
    duration,
    onComplete
  })
}

/**
 * Check if a token is currently being animated.
 */
export function isTokenAnimating(tokenId: string): boolean {
  return activeAnimations.has(tokenId)
}

/**
 * Cancel any active animation for a token.
 */
export function cancelTokenAnimation(tokenId: string): void {
  activeAnimations.delete(tokenId)
}

/**
 * Clean up all animations (call on unmount).
 */
export function destroyTokenAnimations(): void {
  activeAnimations.clear()
  if (appRef) {
    appRef.ticker.remove(tick)
    appRef = null
  }
  tickerBound = false
}
