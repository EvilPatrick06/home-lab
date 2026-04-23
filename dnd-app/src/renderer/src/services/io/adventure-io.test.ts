import { describe, expect, it } from 'vitest'
import { type AdventureExportData, validateAdventureImport } from './adventure-io'

describe('adventure-io', () => {
  const validData: AdventureExportData = {
    version: 1,
    adventure: {
      id: 'adv-1',
      title: 'Lost Mine of Phandelver',
      levelTier: '1-5',
      premise: 'A classic starter adventure',
      hook: 'A dwarf needs an escort',
      villain: 'The Black Spider',
      setting: 'Sword Coast',
      playerStakes: 'Treasure and glory',
      encounters: 'Multiple dungeon encounters',
      climax: 'Confrontation in Wave Echo Cave',
      resolution: 'The mine is secured',
      createdAt: '2024-01-01T00:00:00Z'
    },
    encounters: [
      {
        id: 'enc-1',
        name: 'Goblin Ambush',
        description: 'An ambush on the road',
        monsters: [],
        difficulty: 'easy',
        levelRange: { min: 1, max: 4 },
        totalXP: 100
      }
    ],
    npcs: [
      {
        id: 'npc-1',
        name: 'Gundren Rockseeker',
        description: 'A friendly dwarf',
        isVisible: true,
        notes: ''
      }
    ]
  }

  describe('validateAdventureImport', () => {
    it('returns normalized data with new IDs', () => {
      const result = validateAdventureImport(validData)
      expect(result).not.toBeNull()
      expect(result!.adventure.title).toBe('Lost Mine of Phandelver')
      expect(result!.adventure.id).not.toBe('adv-1') // New UUID
      expect(result!.encounters).toHaveLength(1)
      expect(result!.encounters[0].id).not.toBe('enc-1') // New UUID
      expect(result!.npcs).toHaveLength(1)
      expect(result!.npcs[0].id).not.toBe('npc-1') // New UUID
    })

    it('returns null for missing adventure', () => {
      const bad = { version: 1 } as unknown as AdventureExportData
      expect(validateAdventureImport(bad)).toBeNull()
    })

    it('returns null for adventure without title', () => {
      const bad = {
        version: 1,
        adventure: { id: 'x', title: '' }
      } as unknown as AdventureExportData
      expect(validateAdventureImport(bad)).toBeNull()
    })

    it('handles missing encounters and npcs', () => {
      const minimal: AdventureExportData = {
        version: 1,
        adventure: validData.adventure
      }
      const result = validateAdventureImport(minimal)
      expect(result).not.toBeNull()
      expect(result!.encounters).toEqual([])
      expect(result!.npcs).toEqual([])
    })
  })
})
