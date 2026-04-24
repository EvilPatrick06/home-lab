import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(
    readSync(resolvePath(__dirname, '../../public/data/5e/dm/npcs/generation-tables/npc-mannerisms.json'), 'utf-8')
  )
})

vi.mock('../services/data-provider', () => ({
  load5eNpcMannerisms: vi.fn(() => Promise.resolve(dataJson))
}))

import { NPC_MANNERISMS, NPC_VOICE_DESCRIPTIONS } from './npc-mannerisms'

describe('NPC Mannerisms — initial exports', () => {
  it('NPC_VOICE_DESCRIPTIONS is an array', () => {
    expect(Array.isArray(NPC_VOICE_DESCRIPTIONS)).toBe(true)
  })

  it('NPC_MANNERISMS is an array', () => {
    expect(Array.isArray(NPC_MANNERISMS)).toBe(true)
  })
})

describe('NPC Mannerisms JSON — data quality', () => {
  it('has voiceDescriptions and mannerisms categories', () => {
    expect(dataJson).toHaveProperty('voiceDescriptions')
    expect(dataJson).toHaveProperty('mannerisms')
  })

  it('voiceDescriptions is a non-empty string array', () => {
    const voices = dataJson.voiceDescriptions as string[]
    expect(Array.isArray(voices)).toBe(true)
    expect(voices.length).toBeGreaterThan(0)
    for (const v of voices) {
      expect(typeof v).toBe('string')
      expect(v.length).toBeGreaterThan(0)
    }
  })

  it('mannerisms is a non-empty string array', () => {
    const mannerisms = dataJson.mannerisms as string[]
    expect(Array.isArray(mannerisms)).toBe(true)
    expect(mannerisms.length).toBeGreaterThan(0)
    for (const m of mannerisms) {
      expect(typeof m).toBe('string')
      expect(m.length).toBeGreaterThan(0)
    }
  })

  it('voiceDescriptions has at least 10 entries for variety', () => {
    expect(dataJson.voiceDescriptions.length).toBeGreaterThanOrEqual(10)
  })

  it('mannerisms has at least 10 entries for variety', () => {
    expect(dataJson.mannerisms.length).toBeGreaterThanOrEqual(10)
  })

  it('voiceDescriptions include common voice types', () => {
    const voices = dataJson.voiceDescriptions as string[]
    expect(voices).toContain('Gruff')
    expect(voices).toContain('Whispers')
    expect(voices).toContain('Booming')
    expect(voices).toContain('Monotone')
  })

  it('mannerisms include behavioral quirks', () => {
    const mannerisms = dataJson.mannerisms as string[]
    expect(mannerisms).toContain('Fidgets constantly')
    expect(mannerisms).toContain('Paces while talking')
  })

  it('no duplicate entries in voiceDescriptions', () => {
    const voices = dataJson.voiceDescriptions as string[]
    const unique = new Set(voices)
    expect(unique.size).toBe(voices.length)
  })

  it('no duplicate entries in mannerisms', () => {
    const mannerisms = dataJson.mannerisms as string[]
    const unique = new Set(mannerisms)
    expect(unique.size).toBe(mannerisms.length)
  })
})
