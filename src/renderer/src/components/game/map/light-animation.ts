/**
 * Light Animation System — Animates light source radii each frame using a
 * PixiJS Ticker. Supports flicker, pulse, and wave animation types.
 *
 * Animated radii are stored in a map and consumed by the lighting overlay
 * during its next redraw.
 */

import type { Ticker } from 'pixi.js'
import type { LightAnimation } from '../../../types/campaign'

export interface AnimatedLightRadius {
  brightRadius: number
  dimRadius: number
}

interface LightAnimationEntry {
  sourceId: string
  baseBright: number
  baseDim: number
  animation: LightAnimation
  /** Smoothed jitter value for flicker (lerp target) */
  flickerCurrent: number
  /** Next random jitter target for flicker */
  flickerTarget: number
  /** Time since last flicker target change */
  flickerTimer: number
}

/** Active animation entries, keyed by light source id */
const entries = new Map<string, LightAnimationEntry>()

/** Current animated radii, keyed by light source id */
const animatedRadii = new Map<string, AnimatedLightRadius>()

/** Elapsed time in seconds (accumulated across frames) */
let elapsedTime = 0

/** Reference to the ticker callback so we can remove it */
let tickerCallback: ((ticker: Ticker) => void) | null = null

/**
 * Register or update a light source for animation.
 * If the source has no animation, it is removed from the animation system.
 */
export function registerLightAnimation(
  sourceId: string,
  baseBright: number,
  baseDim: number,
  animation: LightAnimation | undefined
): void {
  if (!animation) {
    entries.delete(sourceId)
    animatedRadii.delete(sourceId)
    return
  }

  const existing = entries.get(sourceId)
  if (
    existing &&
    existing.animation.type === animation.type &&
    existing.animation.intensity === animation.intensity &&
    existing.animation.speed === animation.speed &&
    existing.baseBright === baseBright &&
    existing.baseDim === baseDim
  ) {
    return // No change
  }

  entries.set(sourceId, {
    sourceId,
    baseBright,
    baseDim,
    animation,
    flickerCurrent: 0,
    flickerTarget: (Math.random() - 0.5) * 2,
    flickerTimer: 0
  })
}

/**
 * Remove a light source from the animation system.
 */
export function unregisterLightAnimation(sourceId: string): void {
  entries.delete(sourceId)
  animatedRadii.delete(sourceId)
}

/**
 * Get the current animated radii for a light source.
 * Returns undefined if the source is not animated.
 */
export function getAnimatedRadius(sourceId: string): AnimatedLightRadius | undefined {
  return animatedRadii.get(sourceId)
}

/**
 * Returns true if any light sources are currently animated.
 */
export function hasActiveAnimations(): boolean {
  return entries.size > 0
}

/**
 * Clear all animations and reset state.
 */
export function clearAllAnimations(): void {
  entries.clear()
  animatedRadii.clear()
  elapsedTime = 0
}

/**
 * The per-frame update function. Called by the PixiJS ticker.
 * Updates animated radii for all registered light sources.
 *
 * @param dt Delta time from the ticker (in Ticker units, ~16.67ms per frame at 60fps)
 */
export function updateLightAnimations(dt: number): void {
  const deltaSeconds = dt / 60 // PixiJS Ticker deltaTime is in frames at 60fps

  elapsedTime += deltaSeconds

  for (const entry of entries.values()) {
    const { animation, baseBright, baseDim } = entry
    const intensityFraction = animation.intensity / 100

    let brightMul = 1
    let dimMul = 1

    switch (animation.type) {
      case 'flicker': {
        // Update flicker: smoothly lerp toward random jitter targets
        entry.flickerTimer += deltaSeconds
        // Change target every 0.05-0.15 seconds based on speed
        const changeInterval = 0.1 / Math.max(animation.speed, 0.1)
        if (entry.flickerTimer >= changeInterval) {
          entry.flickerTarget = (Math.random() - 0.5) * 2
          entry.flickerTimer = 0
        }
        // Lerp current toward target
        const lerpSpeed = Math.min(1, deltaSeconds * animation.speed * 15)
        entry.flickerCurrent += (entry.flickerTarget - entry.flickerCurrent) * lerpSpeed
        const flickerAmount = entry.flickerCurrent * intensityFraction
        brightMul = 1 + flickerAmount
        dimMul = 1 + flickerAmount * 0.7 // Dim radius flickers less
        break
      }

      case 'pulse': {
        // Sinusoidal oscillation
        const pulseFactor = Math.sin(elapsedTime * animation.speed * Math.PI * 2) * intensityFraction
        brightMul = 1 + pulseFactor
        dimMul = 1 + pulseFactor
        break
      }

      case 'wave': {
        // Radial wave: bright and dim expand/contract in offset phases
        const waveFactor = Math.sin(elapsedTime * animation.speed * Math.PI * 2) * intensityFraction
        const waveOffset = Math.sin(elapsedTime * animation.speed * Math.PI * 2 + Math.PI / 3) * intensityFraction
        brightMul = 1 + waveFactor
        dimMul = 1 + waveOffset
        break
      }
    }

    // Clamp to ensure radii never go negative
    animatedRadii.set(entry.sourceId, {
      brightRadius: Math.max(0.5, baseBright * brightMul),
      dimRadius: Math.max(0.5, baseDim * dimMul)
    })
  }
}

/**
 * Install the animation ticker on a PixiJS application.
 * Returns a cleanup function to remove the ticker.
 */
export function installLightAnimationTicker(ticker: Ticker): () => void {
  if (tickerCallback) {
    ticker.remove(tickerCallback)
  }

  tickerCallback = (t: Ticker) => {
    if (entries.size > 0) {
      updateLightAnimations(t.deltaTime)
    }
  }

  ticker.add(tickerCallback)

  return () => {
    if (tickerCallback) {
      ticker.remove(tickerCallback)
      tickerCallback = null
    }
    clearAllAnimations()
  }
}
