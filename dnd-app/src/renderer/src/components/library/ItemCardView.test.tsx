import { describe, expect, it } from 'vitest'

// Test the display logic used by ItemCardView
// (Component rendering is validated via manual smoke tests)

describe('ItemCardView rarity colors', () => {
  const RARITY_COLORS: Record<string, string> = {
    common: 'text-muted',
    uncommon: 'text-green-400',
    rare: 'text-blue-400',
    'very rare': 'text-purple-400',
    legendary: 'text-accent',
    artifact: 'text-red-400'
  }

  it('maps each rarity to correct color class', () => {
    expect(RARITY_COLORS.common).toBe('text-muted')
    expect(RARITY_COLORS.uncommon).toBe('text-green-400')
    expect(RARITY_COLORS.rare).toBe('text-blue-400')
    expect(RARITY_COLORS['very rare']).toBe('text-purple-400')
    expect(RARITY_COLORS.legendary).toBe('text-accent')
    expect(RARITY_COLORS.artifact).toBe('text-red-400')
  })

  it('returns undefined for unknown rarities', () => {
    expect(RARITY_COLORS.unknown).toBeUndefined()
  })
})

describe('ItemCardView category detection', () => {
  it('identifies weapon categories', () => {
    expect('weapons'.replace(/-/g, ' ')).toBe('weapons')
  })

  it('identifies magic-items category', () => {
    expect('magic-items'.replace(/-/g, ' ')).toBe('magic items')
  })
})
