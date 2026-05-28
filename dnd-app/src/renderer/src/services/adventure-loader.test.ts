import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAdventures } from './adventure-loader'

// Phase 15g — adventure-loader now routes through the data-provider IPC loader (library façade)
// instead of a raw fetch, so we mock `loadJson` rather than global fetch.
const { mockLoadJson } = vi.hoisted(() => ({ mockLoadJson: vi.fn() }))
vi.mock('./data-provider', () => ({
  loadJson: mockLoadJson
}))

describe('adventure-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The module caches internally; reset between tests so each gets a fresh import.
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads adventures from the correct path via the data-provider façade', async () => {
    mockLoadJson.mockResolvedValue([])

    const { loadAdventures: load } = await import('./adventure-loader')
    await load()

    expect(mockLoadJson).toHaveBeenCalledWith('./data/5e/adventures/adventures.json')
  })

  it('returns an array of adventures on success', async () => {
    const adventures = [
      { id: 'a1', name: 'Lost Mine', system: 'dnd5e', description: 'Test', icon: '', chapters: [] },
      { id: 'a2', name: 'Curse of Strahd', system: 'dnd5e', description: 'Test', icon: '', chapters: [] }
    ]
    mockLoadJson.mockResolvedValue(adventures)

    const { loadAdventures: load } = await import('./adventure-loader')
    const result = await load()

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Lost Mine')
    expect(result[1].name).toBe('Curse of Strahd')
  })

  it('returns an empty array when the loader throws a network/IPC error', async () => {
    mockLoadJson.mockRejectedValue(new Error('Network error'))

    const { loadAdventures: load } = await import('./adventure-loader')
    const result = await load()

    expect(result).toEqual([])
  })

  it('caches the result on subsequent calls', async () => {
    const adventures = [{ id: 'a1', name: 'Test', system: 'dnd5e', description: '', icon: '', chapters: [] }]
    mockLoadJson.mockResolvedValue(adventures)

    const { loadAdventures: load } = await import('./adventure-loader')
    const result1 = await load()
    const result2 = await load()

    // Loader should only be called once due to caching
    expect(mockLoadJson).toHaveBeenCalledTimes(1)
    expect(result1).toBe(result2) // Same reference
  })

  it('top-level loadAdventures import returns an array', async () => {
    mockLoadJson.mockRejectedValue(new Error('Offline'))
    expect(typeof loadAdventures).toBe('function')
    const result = await loadAdventures()
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns adventure objects matching the Adventure interface shape', async () => {
    const adventure = {
      id: 'a1',
      name: 'Dragon Heist',
      system: 'dnd5e',
      description: 'Urban adventure',
      icon: 'dragon.png',
      levelRange: { min: 1, max: 5 },
      chapters: [
        {
          title: 'Chapter 1',
          description: 'Intro',
          maps: ['map1'],
          encounters: ['enc1']
        }
      ],
      npcs: [
        {
          id: 'npc1',
          name: 'Volo',
          description: 'Famous author',
          location: 'Yawning Portal',
          role: 'patron'
        }
      ]
    }
    mockLoadJson.mockResolvedValue([adventure])

    const { loadAdventures: load } = await import('./adventure-loader')
    const result = await load()

    expect(result[0].id).toBe('a1')
    expect(result[0].chapters).toHaveLength(1)
    expect(result[0].npcs).toHaveLength(1)
    expect(result[0].levelRange).toEqual({ min: 1, max: 5 })
  })
})
