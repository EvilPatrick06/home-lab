import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(
    readSync(
      resolvePath(__dirname, '../../public/data/5e/dm/npcs/generation-tables/alignment-descriptions.json'),
      'utf-8'
    )
  )
})

vi.mock('../services/data-provider', () => ({
  load5eAlignmentDescriptions: vi.fn(() => Promise.resolve(dataJson))
}))

import { ALIGNMENT_DESCRIPTIONS } from './alignment-descriptions'

describe('ALIGNMENT_DESCRIPTIONS', () => {
  it('is a Record<string, string>', () => {
    expect(typeof ALIGNMENT_DESCRIPTIONS).toBe('object')
    expect(ALIGNMENT_DESCRIPTIONS).not.toBeNull()
  })

  it('contains all 9 standard D&D alignments', () => {
    const expectedAlignments = [
      'Lawful Good',
      'Neutral Good',
      'Chaotic Good',
      'Lawful Neutral',
      'Neutral',
      'Chaotic Neutral',
      'Lawful Evil',
      'Neutral Evil',
      'Chaotic Evil'
    ]
    for (const alignment of expectedAlignments) {
      expect(dataJson[alignment], `Missing alignment: ${alignment}`).toBeDefined()
      expect(typeof dataJson[alignment]).toBe('string')
      expect(dataJson[alignment].length).toBeGreaterThan(0)
    }
  })

  it('has exactly 9 alignment entries (no extras)', () => {
    expect(Object.keys(dataJson).length).toBe(9)
  })

  it('Lawful Good mentions fighting injustice or protecting the innocent', () => {
    expect(dataJson['Lawful Good']).toContain('injustice')
  })

  it('Chaotic Evil mentions violence or bloodlust', () => {
    expect(dataJson['Chaotic Evil']).toMatch(/violence|bloodlust/)
  })

  it('Neutral describes avoiding moral questions', () => {
    expect(dataJson.Neutral).toContain('moral')
  })

  it('all descriptions are non-empty strings', () => {
    for (const [key, value] of Object.entries(dataJson)) {
      expect(typeof value, `${key} should be a string`).toBe('string')
      expect((value as string).length, `${key} description should not be empty`).toBeGreaterThan(10)
    }
  })
})
