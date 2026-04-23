import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAdventures } from './adventure-loader'

// --- Mock global fetch ---
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('adventure-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the cached adventures by re-importing the module fresh
    // Since the module caches internally, we need to reset between tests
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches adventures from the correct URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    })

    // We need a fresh import to avoid cache
    const { loadAdventures: load } = await import('./adventure-loader')
    await load()

    expect(mockFetch).toHaveBeenCalledWith('./data/5e/adventures/adventures.json')
  })

  it('returns an array of adventures on success', async () => {
    const adventures = [
      { id: 'a1', name: 'Lost Mine', system: 'dnd5e', description: 'Test', icon: '', chapters: [] },
      { id: 'a2', name: 'Curse of Strahd', system: 'dnd5e', description: 'Test', icon: '', chapters: [] }
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => adventures
    })

    const { loadAdventures: load } = await import('./adventure-loader')
    const result = await load()

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Lost Mine')
    expect(result[1].name).toBe('Curse of Strahd')
  })

  it('returns an empty array when fetch returns non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404
    })

    const { loadAdventures: load } = await import('./adventure-loader')
    const result = await load()

    expect(result).toEqual([])
  })

  it('returns an empty array when fetch throws a network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { loadAdventures: load } = await import('./adventure-loader')
    const result = await load()

    expect(result).toEqual([])
  })

  it('caches the result on subsequent calls', async () => {
    const adventures = [{ id: 'a1', name: 'Test', system: 'dnd5e', description: '', icon: '', chapters: [] }]
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => adventures
    })

    const { loadAdventures: load } = await import('./adventure-loader')
    const result1 = await load()
    const result2 = await load()

    // Fetch should only be called once due to caching
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result1).toBe(result2) // Same reference
  })

  it('top-level loadAdventures import returns empty array on fetch error', async () => {
    mockFetch.mockRejectedValue(new Error('Offline'))
    // Use the statically-imported reference to verify the export exists and is callable
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
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [adventure]
    })

    const { loadAdventures: load } = await import('./adventure-loader')
    const result = await load()

    expect(result[0].id).toBe('a1')
    expect(result[0].chapters).toHaveLength(1)
    expect(result[0].npcs).toHaveLength(1)
    expect(result[0].levelRange).toEqual({ min: 1, max: 5 })
  })
})
