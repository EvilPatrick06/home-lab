import { describe, expect, it } from 'vitest'

describe('state-types', () => {
  it('exports PLAYER_COLORS as an array of strings', async () => {
    const mod = await import('./state-types')
    expect(mod.PLAYER_COLORS).toBeDefined()
    expect(Array.isArray(mod.PLAYER_COLORS)).toBe(true)
    expect(mod.PLAYER_COLORS.length).toBeGreaterThan(0)
    for (const color of mod.PLAYER_COLORS) {
      expect(typeof color).toBe('string')
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('PLAYER_COLORS contains at least 10 colors', async () => {
    const { PLAYER_COLORS } = await import('./state-types')
    expect(PLAYER_COLORS.length).toBeGreaterThanOrEqual(10)
  })

  it('PLAYER_COLORS has no duplicates', async () => {
    const { PLAYER_COLORS } = await import('./state-types')
    const unique = new Set(PLAYER_COLORS)
    expect(unique.size).toBe(PLAYER_COLORS.length)
  })

  it('PeerInfo interface satisfies expected shape', () => {
    const peer: import('./state-types').PeerInfo = {
      peerId: 'peer-1',
      displayName: 'Alice',
      characterId: 'char-1',
      characterName: 'Elara',
      isReady: true,
      isHost: false
    }
    expect(peer.peerId).toBe('peer-1')
    expect(peer.displayName).toBe('Alice')
    expect(peer.isReady).toBe(true)
    expect(peer.isHost).toBe(false)
  })

  it('PeerInfo supports optional color and isCoDM fields', () => {
    const peer: import('./state-types').PeerInfo = {
      peerId: 'peer-2',
      displayName: 'Bob',
      characterId: null,
      characterName: null,
      isReady: false,
      isHost: true,
      color: '#FF0000',
      isCoDM: true
    }
    expect(peer.color).toBe('#FF0000')
    expect(peer.isCoDM).toBe(true)
  })

  it('ConnectionState type accepts valid values', () => {
    const states: import('./state-types').ConnectionState[] = ['disconnected', 'connecting', 'connected', 'error']
    expect(states).toHaveLength(4)
    expect(states).toContain('disconnected')
    expect(states).toContain('connected')
  })

  it('ShopItem interface satisfies expected shape', () => {
    const item: import('./state-types').ShopItem = {
      id: 'item-1',
      name: 'Longsword',
      category: 'weapon',
      price: { gp: 15 },
      quantity: 3
    }
    expect(item.name).toBe('Longsword')
    expect(item.price.gp).toBe(15)
    expect(item.quantity).toBe(3)
  })

  it('ShopItem supports optional rarity and stock fields', () => {
    const item: import('./state-types').ShopItem = {
      id: 'item-2',
      name: 'Flame Tongue',
      category: 'weapon',
      price: { gp: 5000 },
      quantity: 1,
      rarity: 'rare',
      shopCategory: 'weapon',
      stockLimit: 1,
      stockRemaining: 0,
      isHidden: false
    }
    expect(item.rarity).toBe('rare')
    expect(item.shopCategory).toBe('weapon')
    expect(item.stockRemaining).toBe(0)
  })

  it('NetworkMap interface satisfies expected shape', () => {
    const map: import('./state-types').NetworkMap = {
      id: 'map-1',
      name: 'Dungeon Level 1',
      campaignId: 'campaign-1',
      imagePath: '/path/to/image.jpg',
      width: 40,
      height: 30,
      grid: {},
      tokens: [],
      fogOfWar: {},
      terrain: [],
      createdAt: '2025-01-01T00:00:00Z'
    }
    expect(map.id).toBe('map-1')
    expect(map.width).toBe(40)
    expect(map.tokens).toEqual([])
  })

  it('GameStateFullPayload interface satisfies expected shape', () => {
    const payload: import('./state-types').GameStateFullPayload = {
      peers: [
        {
          peerId: 'host-1',
          displayName: 'DM',
          characterId: null,
          characterName: null,
          isReady: true,
          isHost: true
        }
      ],
      campaignId: 'campaign-1'
    }
    expect(payload.peers).toHaveLength(1)
    expect(payload.peers[0].isHost).toBe(true)
    expect(payload.campaignId).toBe('campaign-1')
  })

  it('NetworkGameState interface satisfies expected shape', () => {
    const state: import('./state-types').NetworkGameState = {
      activeMapId: null,
      maps: [],
      turnMode: 'free',
      initiative: null,
      round: 1,
      conditions: [],
      isPaused: false,
      turnStates: {},
      underwaterCombat: false,
      flankingEnabled: true,
      groupInitiativeEnabled: false,
      ambientLight: 'bright',
      diagonalRule: 'standard',
      travelPace: null,
      marchingOrder: [],
      inGameTime: null,
      allies: [],
      enemies: [],
      places: [],
      handouts: []
    }
    expect(state.turnMode).toBe('free')
    expect(state.round).toBe(1)
    expect(state.flankingEnabled).toBe(true)
  })
})
