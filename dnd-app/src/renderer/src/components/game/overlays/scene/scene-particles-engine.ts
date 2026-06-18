/**
 * PHASE-35 35C — pure, DOM-free particle math for the cinematic scene layer. Six presets, seeded
 * spawning, in-place stepping with edge wrap + dt scaling. No React, no canvas — fully unit-testable;
 * `SceneParticles.tsx` owns the canvas + rAF lifecycle and just calls these.
 */

import type { SceneParticleEffect } from '../../../../stores/game/types'

export interface SceneParticle {
  x: number
  y: number
  phase: number
  speedMul: number
  alpha: number
  size: number
}

export interface ParticlePresetConfig {
  count: number // at 1920×1080 reference; scaled by area
  color: string // canvas fillStyle
  baseSpeed: number // px/frame at 60fps, scaled by dt
  baseSize: number
  drift: number // horizontal sine amplitude
  direction: 'down' | 'up' | 'float'
  blur?: number // shadowBlur for glow (fireflies/embers)
}

export const PARTICLE_PRESETS: Record<Exclude<SceneParticleEffect, 'none'>, ParticlePresetConfig> = {
  embers: { count: 90, color: '#ff9a3c', baseSpeed: 0.7, baseSize: 2.2, drift: 18, direction: 'up', blur: 6 },
  fireflies: { count: 40, color: '#d8ff7a', baseSpeed: 0.25, baseSize: 2.0, drift: 40, direction: 'float', blur: 8 },
  snow: { count: 180, color: '#ffffff', baseSpeed: 0.9, baseSize: 2.4, drift: 24, direction: 'down' },
  rain: { count: 260, color: '#9ec8ef', baseSpeed: 7.5, baseSize: 1.2, drift: 4, direction: 'down' },
  fog: { count: 14, color: '#cfd8dc', baseSpeed: 0.15, baseSize: 160, drift: 60, direction: 'float' },
  motes: { count: 70, color: '#e8dcb8', baseSpeed: 0.2, baseSize: 1.6, drift: 30, direction: 'float' }
}

const REF_AREA = 1920 * 1080
const FRAME_MS = 1000 / 60

/** Density scales with viewport area, clamped so tiny/huge screens stay sane. */
export function scaledCount(baseCount: number, width: number, height: number): number {
  const factor = Math.max(0.25, Math.min(1.5, (width * height) / REF_AREA))
  return Math.max(1, Math.round(baseCount * factor))
}

export function spawnParticles(
  effect: Exclude<SceneParticleEffect, 'none'>,
  width: number,
  height: number,
  rand: () => number = Math.random
): SceneParticle[] {
  const cfg = PARTICLE_PRESETS[effect]
  const n = scaledCount(cfg.count, width, height)
  const out: SceneParticle[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x: rand() * width,
      y: rand() * height,
      phase: rand() * Math.PI * 2,
      speedMul: 0.6 + rand() * 0.8,
      alpha: 0.4 + rand() * 0.6,
      size: cfg.baseSize * (0.7 + rand() * 0.6)
    })
  }
  return out
}

/**
 * Advance every particle in place by `dt` ms. Displacement is linear in dt (so doubling dt doubles
 * motion); particles wrap at the edges so the field never empties. `down` falls and re-enters at the
 * top, `up` rises and re-enters at the bottom, `float` sine-drifts both axes via its phase.
 */
export function stepParticles(
  particles: SceneParticle[],
  config: ParticlePresetConfig,
  width: number,
  height: number,
  dt: number
): void {
  const f = dt / FRAME_MS
  for (const p of particles) {
    p.phase += 0.03 * f
    const speed = config.baseSpeed * p.speedMul * f
    const sway = Math.sin(p.phase) * config.drift * 0.02 * f
    if (config.direction === 'down') {
      p.y += speed
      p.x += sway
      if (p.y > height) p.y -= height
    } else if (config.direction === 'up') {
      p.y -= speed
      p.x += sway
      if (p.y < 0) p.y += height
    } else {
      // float: gentle two-axis drift
      p.x += Math.cos(p.phase) * speed + sway
      p.y += Math.sin(p.phase) * speed
    }
    // Horizontal wrap (and vertical, for float) keeps the field full.
    if (p.x > width) p.x -= width
    else if (p.x < 0) p.x += width
    if (config.direction === 'float') {
      if (p.y > height) p.y -= height
      else if (p.y < 0) p.y += height
    }
  }
}
