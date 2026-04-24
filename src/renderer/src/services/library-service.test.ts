import { beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted so the variable is available inside the hoisted vi.mock factory
const { mockLoadFn } = vi.hoisted(() => ({
  mockLoadFn: vi.fn(() => Promise.resolve([]))
}))

vi.mock('./data-provider', () => ({
  load5eBackgrounds: mockLoadFn,
  load5eChaseTables: vi.fn(() => Promise.resolve({})),
  load5eClasses: mockLoadFn,
  load5eClassFeatures: vi.fn(() => Promise.resolve({})),
  load5eConditions: mockLoadFn,
  load5eCrafting: mockLoadFn,
  load5eCreatures: mockLoadFn,
  load5eCurses: mockLoadFn,
  load5eDiseases: mockLoadFn,
  load5eDowntime: mockLoadFn,
  load5eEncounterPresets: mockLoadFn,
  load5eEnvironmentalEffects: mockLoadFn,
  load5eEquipment: vi.fn(() => Promise.resolve({ weapons: [], armor: [], gear: [] })),
  load5eFeats: mockLoadFn,
  load5eFightingStyles: mockLoadFn,
  load5eHazards: mockLoadFn,
  load5eInvocations: mockLoadFn,
  load5eLanguages: mockLoadFn,
  load5eMagicItems: mockLoadFn,
  load5eMetamagic: mockLoadFn,
  load5eMonsters: vi.fn(() => Promise.resolve([{ id: 'goblin', name: 'Goblin', cr: '1/4', type: 'humanoid', hp: 7 }])),
  load5eMounts: mockLoadFn,
  load5eNpcs: mockLoadFn,
  load5ePoisons: mockLoadFn,
  load5eRandomTables: vi.fn(() => Promise.resolve({})),
  load5eSettlements: mockLoadFn,
  load5eSiegeEquipment: mockLoadFn,
  load5eSkills: mockLoadFn,
  load5eSounds: mockLoadFn,
  load5eSpecies: mockLoadFn,
  load5eSpells: vi.fn(() =>
    Promise.resolve([{ id: 'fireball', name: 'Fireball', level: 3, school: 'Evocation', lists: ['wizard'] }])
  ),
  load5eSubclasses: mockLoadFn,
  load5eSupernaturalGifts: mockLoadFn,
  load5eTraps: mockLoadFn,
  load5eTreasureTables: vi.fn(() => Promise.resolve({})),
  load5eTrinkets: mockLoadFn,
  load5eVehicles: mockLoadFn,
  load5eWeaponMastery: mockLoadFn
}))

// Mock window.api for characters, campaigns, bastions
vi.stubGlobal('window', {
  api: {
    loadCharacters: vi.fn(() => Promise.resolve([])),
    loadCampaigns: vi.fn(() => Promise.resolve([])),
    loadBastions: vi.fn(() => Promise.resolve([]))
  }
})

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid' })

import { loadCategoryItems, searchAllCategories } from './library-service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('library-service', () => {
  describe('loadCategoryItems', () => {
    it('loads monsters category', async () => {
      const items = await loadCategoryItems('monsters', [])
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Goblin')
      expect(items[0].category).toBe('monsters')
      expect(items[0].source).toBe('official')
    })

    it('loads spells category', async () => {
      const items = await loadCategoryItems('spells', [])
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Fireball')
      expect(items[0].category).toBe('spells')
    })

    it('loads characters from window.api', async () => {
      vi.mocked(window.api.loadCharacters).mockResolvedValueOnce([
        { id: 'char-1', name: 'Gandalf', level: 10, className: 'Wizard' }
      ] as never)
      const items = await loadCategoryItems('characters', [])
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Gandalf')
      expect(items[0].summary).toContain('Wizard')
    })

    it('loads campaigns from window.api', async () => {
      vi.mocked(window.api.loadCampaigns).mockResolvedValueOnce([
        { id: 'camp-1', name: 'Test Campaign', system: '5e', description: 'A test campaign' }
      ] as never)
      const items = await loadCategoryItems('campaigns', [])
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Test Campaign')
    })

    it('loads bastions from window.api', async () => {
      vi.mocked(window.api.loadBastions).mockResolvedValueOnce([
        { id: 'bast-1', name: 'My Bastion', level: 5 }
      ] as never)
      const items = await loadCategoryItems('bastions', [])
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('My Bastion')
    })

    it('returns empty for characters when loadCharacters returns non-array', async () => {
      vi.mocked(window.api.loadCharacters).mockResolvedValueOnce(null as never)
      const items = await loadCategoryItems('characters', [])
      expect(items).toEqual([])
    })

    it('includes homebrew items', async () => {
      const homebrew = [
        {
          id: 'hb-1',
          name: 'Custom Monster',
          type: 'monsters' as const,
          data: { id: 'hb-1', name: 'Custom Monster', cr: '5', type: 'beast', hp: 100 },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01'
        }
      ]
      const items = await loadCategoryItems('monsters', homebrew as never[])
      const hbItem = items.find((i) => i.id === 'hb-1')
      expect(hbItem).toBeDefined()
      expect(hbItem!.source).toBe('homebrew')
    })

    it('loads weapons from equipment data', async () => {
      const { load5eEquipment } = await import('./data-provider')
      vi.mocked(load5eEquipment).mockResolvedValueOnce({
        weapons: [{ id: 'longsword', name: 'Longsword', category: 'martial', damage: '1d8', damageType: 'slashing' }],
        armor: [],
        gear: []
      } as never)
      const items = await loadCategoryItems('weapons', [])
      expect(items).toHaveLength(1)
      expect(items[0].name).toBe('Longsword')
    })

    it('returns homebrew only for unknown category', async () => {
      const items = await loadCategoryItems('nonexistent-cat' as never, [])
      expect(items).toEqual([])
    })

    it('generates summary for different categories', async () => {
      const { load5eMonsters } = await import('./data-provider')
      vi.mocked(load5eMonsters).mockResolvedValueOnce([
        { id: 'dragon', name: 'Dragon', cr: '10', type: 'dragon', hp: 200 }
      ] as never)
      const items = await loadCategoryItems('monsters', [])
      expect(items[0].summary).toContain('CR 10')
      expect(items[0].summary).toContain('200 HP')
    })
  })

  describe('searchAllCategories', () => {
    it('returns empty for blank query', async () => {
      const results = await searchAllCategories('', [])
      expect(results).toEqual([])
    })

    it('returns empty for whitespace-only query', async () => {
      const results = await searchAllCategories('   ', [])
      expect(results).toEqual([])
    })

    it('searches across multiple categories', async () => {
      const results = await searchAllCategories('goblin', [])
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].name).toBe('Goblin')
    })

    it('matches against item summary too', async () => {
      const results = await searchAllCategories('Evocation', [])
      // Fireball is school Evocation, should appear in summary
      const fireball = results.find((r) => r.name === 'Fireball')
      expect(fireball).toBeDefined()
    })

    it('limits results to 100', async () => {
      // Even with many results, should not exceed 100
      const results = await searchAllCategories('a', [])
      expect(results.length).toBeLessThanOrEqual(100)
    })

    it('is case-insensitive', async () => {
      const results = await searchAllCategories('GOBLIN', [])
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })
})
