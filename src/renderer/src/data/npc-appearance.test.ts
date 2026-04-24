import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(
    readSync(resolvePath(__dirname, '../../public/data/5e/dm/npcs/generation-tables/npc-appearance.json'), 'utf-8')
  )
})

vi.mock('../services/data-provider', () => ({
  load5eNpcAppearance: vi.fn(() => Promise.resolve(dataJson))
}))

import {
  NPC_BUILDS,
  NPC_CLOTHING_STYLES,
  NPC_DISTINGUISHING_FEATURES,
  NPC_HAIR_COLORS,
  NPC_HAIR_STYLES,
  NPC_HEIGHTS
} from './npc-appearance'

describe('NPC Appearance — initial exports', () => {
  it('all exports are arrays', () => {
    expect(Array.isArray(NPC_HEIGHTS)).toBe(true)
    expect(Array.isArray(NPC_BUILDS)).toBe(true)
    expect(Array.isArray(NPC_HAIR_COLORS)).toBe(true)
    expect(Array.isArray(NPC_HAIR_STYLES)).toBe(true)
    expect(Array.isArray(NPC_DISTINGUISHING_FEATURES)).toBe(true)
    expect(Array.isArray(NPC_CLOTHING_STYLES)).toBe(true)
  })
})

describe('NPC Appearance JSON — data quality', () => {
  it('has all 6 appearance categories', () => {
    expect(dataJson).toHaveProperty('heights')
    expect(dataJson).toHaveProperty('builds')
    expect(dataJson).toHaveProperty('hairColors')
    expect(dataJson).toHaveProperty('hairStyles')
    expect(dataJson).toHaveProperty('distinguishingFeatures')
    expect(dataJson).toHaveProperty('clothingStyles')
  })

  it('all categories are non-empty string arrays', () => {
    for (const key of ['heights', 'builds', 'hairColors', 'hairStyles', 'distinguishingFeatures', 'clothingStyles']) {
      const arr = dataJson[key] as string[]
      expect(Array.isArray(arr), `${key} should be an array`).toBe(true)
      expect(arr.length, `${key} should not be empty`).toBeGreaterThan(0)
      for (const item of arr) {
        expect(typeof item, `${key} items should be strings`).toBe('string')
        expect(item.length, `${key} items should not be empty strings`).toBeGreaterThan(0)
      }
    }
  })

  it('heights include standard size descriptors', () => {
    const heights = dataJson.heights as string[]
    expect(heights).toContain('Short')
    expect(heights).toContain('Average')
    expect(heights).toContain('Tall')
  })

  it('builds include a range of body types', () => {
    const builds = dataJson.builds as string[]
    expect(builds).toContain('Thin')
    expect(builds).toContain('Average')
    expect(builds).toContain('Muscular')
  })

  it('hairColors include common natural colors', () => {
    const colors = dataJson.hairColors as string[]
    expect(colors).toContain('Black')
    expect(colors).toContain('Brown')
    expect(colors).toContain('Blonde')
    expect(colors).toContain('Red')
    expect(colors).toContain('Gray')
    expect(colors).toContain('White')
  })

  it('hairStyles include Bald as an option', () => {
    const styles = dataJson.hairStyles as string[]
    expect(styles).toContain('Bald')
  })

  it('distinguishingFeatures has diverse entries', () => {
    const features = dataJson.distinguishingFeatures as string[]
    expect(features.length).toBeGreaterThanOrEqual(10)
    // Check for some expected entries
    expect(features).toContain('Eyepatch')
    expect(features).toContain('Gold tooth')
  })

  it('clothingStyles cover a range from poor to wealthy', () => {
    const styles = dataJson.clothingStyles as string[]
    expect(styles).toContain('Ragged')
    expect(styles).toContain('Fine')
    expect(styles).toContain('Exotic')
  })

  it('no duplicate entries in any category', () => {
    for (const key of ['heights', 'builds', 'hairColors', 'hairStyles', 'distinguishingFeatures', 'clothingStyles']) {
      const arr = dataJson[key] as string[]
      const unique = new Set(arr)
      expect(unique.size, `${key} should have no duplicates`).toBe(arr.length)
    }
  })
})
