import { describe, expect, it } from 'vitest'
import type { SceneParticleEffect } from '../../../../stores/game/types'
import { PARTICLE_PRESETS, scaledCount, spawnParticles, stepParticles } from './scene-particles-engine'

// Keep the preset table and the SceneParticleEffect enum (35B schema) from drifting.
const EXPECTED: Array<Exclude<SceneParticleEffect, 'none'>> = ['embers', 'fireflies', 'snow', 'rain', 'fog', 'motes']

// Deterministic pseudo-rand for reproducible spawns.
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

describe('scene-particles-engine (PHASE-35 35C)', () => {
  it('PARTICLE_PRESETS covers every effect except none', () => {
    expect(Object.keys(PARTICLE_PRESETS).sort()).toEqual([...EXPECTED].sort())
  })

  it('spawnParticles returns scaled count, all inside bounds', () => {
    const w = 960
    const h = 540 // quarter area → factor 0.25
    const particles = spawnParticles('snow', w, h, seeded(42))
    expect(particles).toHaveLength(scaledCount(PARTICLE_PRESETS.snow.count, w, h))
    for (const p of particles) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(w)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(h)
    }
  })

  it('scaledCount clamps to [0.25, 1.5] of the base', () => {
    expect(scaledCount(100, 10, 10)).toBe(25) // far below ref → 0.25
    expect(scaledCount(100, 4000, 4000)).toBe(150) // far above ref → 1.5
  })

  it('down particles wrap from the bottom edge back to the top', () => {
    const cfg = PARTICLE_PRESETS.snow
    const p = [{ x: 50, y: 999, phase: 0, speedMul: 1, alpha: 1, size: 2 }]
    stepParticles(p, cfg, 100, 1000, 100) // big dt pushes y past 1000
    expect(p[0].y).toBeLessThan(1000)
    expect(p[0].y).toBeGreaterThanOrEqual(0)
  })

  it('up particles wrap from the top edge back to the bottom', () => {
    const cfg = PARTICLE_PRESETS.embers
    const p = [{ x: 50, y: 1, phase: 0, speedMul: 5, alpha: 1, size: 2 }]
    stepParticles(p, cfg, 100, 1000, 100)
    expect(p[0].y).toBeGreaterThan(0)
    expect(p[0].y).toBeLessThanOrEqual(1000)
  })

  it('displacement is linear in dt (doubling dt doubles fall distance)', () => {
    const cfg = PARTICLE_PRESETS.snow
    const a = [{ x: 50, y: 100, phase: 0, speedMul: 1, alpha: 1, size: 2 }]
    const b = [{ x: 50, y: 100, phase: 0, speedMul: 1, alpha: 1, size: 2 }]
    stepParticles(a, cfg, 1000, 10000, 16)
    stepParticles(b, cfg, 1000, 10000, 32)
    const da = a[0].y - 100
    const db = b[0].y - 100
    expect(db).toBeCloseTo(da * 2, 4)
  })
})
