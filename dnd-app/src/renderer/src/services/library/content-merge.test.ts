import { describe, expect, it } from 'vitest'
import { categoryToHomebrewKey, mergeHomebrew, mergePluginData } from './content-merge'

describe('content-merge (PHASE-13 13K)', () => {
  describe('mergeHomebrew', () => {
    it('appends a global homebrew entry tagged source:homebrew', () => {
      const hb = new Map<string, Record<string, unknown>[]>([['spells', [{ id: 'hb1', name: 'Homebrew Bolt' }]]])
      const out = mergeHomebrew('spells', [{ id: 'official', name: 'Fireball' }], hb) as Array<Record<string, unknown>>
      expect(out).toHaveLength(2)
      expect(out[1]).toMatchObject({ id: 'hb1', name: 'Homebrew Bolt', source: 'homebrew' })
    })

    it('unwraps the .data wrapper', () => {
      const hb = new Map<string, Record<string, unknown>[]>([
        ['spells', [{ id: 'w1', data: { name: 'Wrapped', level: 3 } }]]
      ])
      const out = mergeHomebrew('spells', [], hb) as Array<Record<string, unknown>>
      expect(out[0]).toMatchObject({ id: 'w1', name: 'Wrapped', level: 3, source: 'homebrew' })
    })

    it('includes a campaign-scoped entry only when its campaign is active', () => {
      const hb = new Map<string, Record<string, unknown>[]>([
        [
          'spells',
          [
            { id: 'global', name: 'G' },
            { id: 'scoped', name: 'S', campaignId: 'camp-1' }
          ]
        ]
      ])
      const active = mergeHomebrew('spells', [], hb, 'camp-1') as Array<Record<string, unknown>>
      expect(active.map((e) => e.id).sort()).toEqual(['global', 'scoped'])
      const other = mergeHomebrew('spells', [], hb, 'camp-2') as Array<Record<string, unknown>>
      expect(other.map((e) => e.id)).toEqual(['global'])
    })

    it('passes non-array base data through unchanged', () => {
      const hb = new Map<string, Record<string, unknown>[]>([['spells', [{ id: 'x' }]]])
      const base = { not: 'an array' }
      expect(mergeHomebrew('spells', base, hb)).toBe(base)
    })

    it('is a no-op when the category has no homebrew entries', () => {
      const base = [{ id: 'a' }]
      expect(mergeHomebrew('feats', base, new Map())).toBe(base)
    })
  })

  describe('mergePluginData', () => {
    it('appends plugin entries', () => {
      const plugins = new Map<string, Record<string, unknown>[]>([['feats', [{ id: 'p1' }]]])
      const out = mergePluginData('feats', [{ id: 'a' }], plugins) as Array<Record<string, unknown>>
      expect(out.map((e) => e.id)).toEqual(['a', 'p1'])
    })

    it('passes non-array base through', () => {
      const base = { x: 1 }
      expect(mergePluginData('feats', base, new Map([['feats', [{ id: 'p' }]]]))).toBe(base)
    })
  })

  describe('categoryToHomebrewKey', () => {
    it('maps camelCase categories to kebab-case keys', () => {
      expect(categoryToHomebrewKey('speciesTraits')).toBe('species-traits')
      expect(categoryToHomebrewKey('magicItems')).toBe('magic-items')
      expect(categoryToHomebrewKey('spells')).toBe('spells')
    })
  })
})
