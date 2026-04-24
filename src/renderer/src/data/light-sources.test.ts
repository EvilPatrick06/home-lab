import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(readSync(resolvePath(__dirname, '../../public/data/5e/equipment/light-sources.json'), 'utf-8'))
})

vi.mock('../services/data-provider', () => ({
  load5eLightSources: vi.fn(() => Promise.resolve(dataJson))
}))

import type { LightSourceDef } from './light-sources'
import { LIGHT_SOURCE_LABELS, LIGHT_SOURCES } from './light-sources'

describe('LIGHT_SOURCES and LIGHT_SOURCE_LABELS — initial exports', () => {
  it('LIGHT_SOURCES is an object', () => {
    expect(typeof LIGHT_SOURCES).toBe('object')
  })

  it('LIGHT_SOURCE_LABELS is an object', () => {
    expect(typeof LIGHT_SOURCE_LABELS).toBe('object')
  })
})

describe('LightSourceDef — type contract', () => {
  it('has the correct shape with durationSeconds, brightRadius, and dimRadius fields', () => {
    const def: LightSourceDef = {
      durationSeconds: 3600,
      brightRadius: 20,
      dimRadius: 40
    }
    expect(typeof def.durationSeconds).toBe('number')
    expect(typeof def.brightRadius).toBe('number')
    expect(typeof def.dimRadius).toBe('number')
    expect(def.durationSeconds).toBe(3600)
    expect(def.brightRadius).toBe(20)
    expect(def.dimRadius).toBe(40)
  })

  it('LIGHT_SOURCES values conform to LightSourceDef shape', () => {
    // LIGHT_SOURCES is typed as Record<string, LightSourceDef>
    const record: Record<string, LightSourceDef> = LIGHT_SOURCES
    for (const [_key, def] of Object.entries(record)) {
      expect(typeof def.brightRadius).toBe('number')
      expect(typeof def.dimRadius).toBe('number')
      // durationSeconds may be Infinity (for permanent sources) or a number
      expect(typeof def.durationSeconds === 'number').toBe(true)
    }
  })

  it('permanent light source uses Infinity for durationSeconds', () => {
    // Verify that a LightSourceDef can represent an indefinite-duration source
    const permanent: LightSourceDef = {
      durationSeconds: Infinity,
      brightRadius: 20,
      dimRadius: 40
    }
    expect(permanent.durationSeconds).toBe(Infinity)
  })
})

describe('Light Sources JSON — D&D 5e PHB accuracy', () => {
  it('has all expected light source types', () => {
    const expectedKeys = [
      'torch',
      'lantern-hooded',
      'lantern-bullseye',
      'candle',
      'light-cantrip',
      'continual-flame',
      'daylight-spell',
      'lamp',
      'dancing-lights'
    ]
    for (const key of expectedKeys) {
      expect(dataJson[key], `Missing light source: ${key}`).toBeDefined()
    }
  })

  it('all entries have label, durationSeconds, brightRadius, and dimRadius', () => {
    for (const [key, entry] of Object.entries(dataJson)) {
      const e = entry as { label: string; durationSeconds: number | null; brightRadius: number; dimRadius: number }
      expect(typeof e.label, `${key} label`).toBe('string')
      expect(e.durationSeconds === null || typeof e.durationSeconds === 'number', `${key} duration`).toBe(true)
      expect(typeof e.brightRadius, `${key} brightRadius`).toBe('number')
      expect(typeof e.dimRadius, `${key} dimRadius`).toBe('number')
    }
  })

  it('Torch: 20ft bright, 40ft dim, lasts 1 hour (3600s)', () => {
    const torch = dataJson.torch
    expect(torch.brightRadius).toBe(20)
    expect(torch.dimRadius).toBe(40)
    expect(torch.durationSeconds).toBe(3600)
  })

  it('Hooded Lantern: 30ft bright, 60ft dim, lasts 6 hours (21600s)', () => {
    const lantern = dataJson['lantern-hooded']
    expect(lantern.brightRadius).toBe(30)
    expect(lantern.dimRadius).toBe(60)
    expect(lantern.durationSeconds).toBe(21600)
  })

  it('Bullseye Lantern: 60ft bright, 120ft dim, lasts 6 hours', () => {
    const lantern = dataJson['lantern-bullseye']
    expect(lantern.brightRadius).toBe(60)
    expect(lantern.dimRadius).toBe(120)
    expect(lantern.durationSeconds).toBe(21600)
  })

  it('Candle: 5ft bright, 10ft dim, lasts 1 hour', () => {
    const candle = dataJson.candle
    expect(candle.brightRadius).toBe(5)
    expect(candle.dimRadius).toBe(10)
    expect(candle.durationSeconds).toBe(3600)
  })

  it('Continual Flame: 20ft bright, 40ft dim, no duration (permanent)', () => {
    const cf = dataJson['continual-flame']
    expect(cf.brightRadius).toBe(20)
    expect(cf.dimRadius).toBe(40)
    expect(cf.durationSeconds).toBeNull()
  })

  it('Light cantrip: 20ft bright, 40ft dim, lasts 1 hour', () => {
    const light = dataJson['light-cantrip']
    expect(light.brightRadius).toBe(20)
    expect(light.dimRadius).toBe(40)
    expect(light.durationSeconds).toBe(3600)
  })

  it('Daylight spell: 60ft bright, 120ft dim, lasts 1 hour', () => {
    const daylight = dataJson['daylight-spell']
    expect(daylight.brightRadius).toBe(60)
    expect(daylight.dimRadius).toBe(120)
    expect(daylight.durationSeconds).toBe(3600)
  })

  it('Lamp: 15ft bright, 45ft dim, lasts 6 hours', () => {
    const lamp = dataJson.lamp
    expect(lamp.brightRadius).toBe(15)
    expect(lamp.dimRadius).toBe(45)
    expect(lamp.durationSeconds).toBe(21600)
  })

  it('Dancing Lights: 10ft bright, 10ft dim, lasts 1 minute (60s)', () => {
    const dl = dataJson['dancing-lights']
    expect(dl.brightRadius).toBe(10)
    expect(dl.dimRadius).toBe(10)
    expect(dl.durationSeconds).toBe(60)
  })

  it('dimRadius is always >= brightRadius', () => {
    for (const [key, entry] of Object.entries(dataJson)) {
      const e = entry as { brightRadius: number; dimRadius: number }
      expect(e.dimRadius, `${key}: dim should be >= bright`).toBeGreaterThanOrEqual(e.brightRadius)
    }
  })
})
