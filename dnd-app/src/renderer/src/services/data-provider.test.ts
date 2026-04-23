import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonsterStatBlock } from '../types/monster'
import { clearDataCache, loadJson, searchMonsters } from './data-provider'

// Mock window.api.game.loadJson for loadJson tests
const mockLoadJson = vi.fn()
vi.stubGlobal('window', {
  api: { game: { loadJson: mockLoadJson } }
})

beforeEach(() => {
  mockLoadJson.mockReset()
  clearDataCache()
})

describe('loadJson', () => {
  it('loads and returns parsed JSON via IPC', async () => {
    const testData = [{ id: 'test', name: 'Test' }]
    mockLoadJson.mockResolvedValueOnce(testData)
    const result = await loadJson<typeof testData>('/test/unique-path-1.json')
    expect(result).toEqual(testData)
    expect(mockLoadJson).toHaveBeenCalledWith('/test/unique-path-1.json')
  })

  it('caches results for repeated calls', async () => {
    const testData = { cached: true }
    mockLoadJson.mockResolvedValueOnce(testData)
    const path = '/test/cache-test.json'
    const first = await loadJson(path)
    const second = await loadJson(path)
    expect(first).toBe(second) // Same reference (cached)
    expect(mockLoadJson).toHaveBeenCalledTimes(1) // Only one IPC call
  })
})

describe('searchMonsters', () => {
  const monsters: MonsterStatBlock[] = [
    {
      id: 'goblin',
      name: 'Goblin',
      type: 'humanoid',
      size: 'Small',
      alignment: 'neutral evil',
      cr: '1/4',
      ac: 15,
      hp: 7,
      speed: '30 ft.',
      abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      actions: [],
      traits: [],
      tags: ['goblinoid']
    },
    {
      id: 'red-dragon',
      name: 'Adult Red Dragon',
      type: 'dragon',
      size: 'Huge',
      alignment: 'chaotic evil',
      cr: '17',
      ac: 19,
      hp: 256,
      speed: '40 ft., fly 80 ft.',
      abilityScores: { str: 27, dex: 10, con: 25, int: 16, wis: 13, cha: 21 },
      actions: [],
      traits: [],
      group: 'Chromatic Dragons',
      tags: ['dragon']
    },
    {
      id: 'zombie',
      name: 'Zombie',
      type: 'undead',
      size: 'Medium',
      alignment: 'neutral evil',
      cr: '1/4',
      ac: 8,
      hp: 22,
      speed: '20 ft.',
      abilityScores: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
      actions: [],
      traits: [],
      tags: []
    }
  ] as unknown as MonsterStatBlock[]

  it('returns all monsters for empty query', () => {
    expect(searchMonsters(monsters, '')).toEqual(monsters)
    expect(searchMonsters(monsters, '  ')).toEqual(monsters)
  })

  it('searches by name', () => {
    const result = searchMonsters(monsters, 'goblin')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('goblin')
  })

  it('searches by type', () => {
    const result = searchMonsters(monsters, 'undead')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('zombie')
  })

  it('searches by group', () => {
    const result = searchMonsters(monsters, 'chromatic')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('red-dragon')
  })

  it('searches by tags', () => {
    const result = searchMonsters(monsters, 'goblinoid')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('goblin')
  })

  it('is case-insensitive', () => {
    expect(searchMonsters(monsters, 'DRAGON')).toHaveLength(1)
    expect(searchMonsters(monsters, 'Dragon')).toHaveLength(1)
  })

  it('returns empty array for no matches', () => {
    expect(searchMonsters(monsters, 'beholder')).toHaveLength(0)
  })
})
