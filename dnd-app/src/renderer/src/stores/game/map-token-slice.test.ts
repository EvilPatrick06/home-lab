import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { createMapTokenSlice } from './map-token-slice'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

vi.mock('../../utils/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

type SliceStore = ReturnType<typeof createMapTokenSlice> & {
  maps: any[]
  activeMapId: string | null
  selectedTokenIds: string[]
  turnStates: Record<string, any>
  currentFloor: number
}

function makeStore() {
  return create<SliceStore>()((set, get, api) => ({
    maps: [],
    activeMapId: null,
    selectedTokenIds: [],
    turnStates: {},
    currentFloor: 0,
    ...createMapTokenSlice(set as any, get as any, api as any)
  }))
}

function makeMap(overrides: Partial<any> = {}) {
  return {
    id: 'map-1',
    name: 'Test Map',
    tokens: [],
    wallSegments: [],
    audioEmitters: [],
    occlusionTiles: [],
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

function makeToken(overrides: Partial<any> = {}) {
  return {
    id: 'tok-1',
    entityId: 'ent-1',
    label: 'Goblin',
    gridX: 0,
    gridY: 0,
    visibleToPlayers: false,
    ...overrides
  }
}

describe('createMapTokenSlice', () => {
  let store: ReturnType<typeof makeStore>

  beforeEach(() => {
    store = makeStore()
  })

  // --- Initial state ---

  it('initial state: maps empty, activeMapId null, no selection', () => {
    const s = store.getState()
    expect(s.maps).toEqual([])
    expect(s.activeMapId).toBeNull()
    expect(s.selectedTokenIds).toEqual([])
    expect(s.centerOnEntityId).toBeNull()
    expect(s.pendingFallDamage).toBeNull()
    expect(s.pendingPlacement).toBeNull()
  })

  // --- Map actions ---

  describe('setActiveMap', () => {
    it('sets activeMapId', () => {
      store.getState().setActiveMap('map-99')
      expect(store.getState().activeMapId).toBe('map-99')
    })
  })

  describe('addMap', () => {
    it('appends map to maps array', () => {
      const map = makeMap()
      store.getState().addMap(map)
      expect(store.getState().maps).toHaveLength(1)
      expect(store.getState().maps[0].id).toBe('map-1')
    })

    it('appending multiple maps preserves order', () => {
      store.getState().addMap(makeMap({ id: 'a' }))
      store.getState().addMap(makeMap({ id: 'b' }))
      const ids = store.getState().maps.map((m: any) => m.id)
      expect(ids).toEqual(['a', 'b'])
    })
  })

  describe('deleteMap', () => {
    it('removes the map', () => {
      store.getState().addMap(makeMap({ id: 'a' }))
      store.getState().addMap(makeMap({ id: 'b' }))
      store.getState().deleteMap('a')
      expect(store.getState().maps.map((m: any) => m.id)).toEqual(['b'])
    })

    it('clears activeMapId when the active map is deleted and none remain', () => {
      store.getState().addMap(makeMap({ id: 'a' }))
      store.getState().setActiveMap('a')
      store.getState().deleteMap('a')
      expect(store.getState().activeMapId).toBeNull()
    })

    it('sets activeMapId to first remaining map when active is deleted', () => {
      store.getState().addMap(makeMap({ id: 'a' }))
      store.getState().addMap(makeMap({ id: 'b' }))
      store.getState().setActiveMap('a')
      store.getState().deleteMap('a')
      expect(store.getState().activeMapId).toBe('b')
    })

    it('preserves activeMapId when a different map is deleted', () => {
      store.getState().addMap(makeMap({ id: 'a' }))
      store.getState().addMap(makeMap({ id: 'b' }))
      store.getState().setActiveMap('b')
      store.getState().deleteMap('a')
      expect(store.getState().activeMapId).toBe('b')
    })

    it('no-op for unknown mapId', () => {
      store.getState().addMap(makeMap({ id: 'a' }))
      store.getState().deleteMap('nope')
      expect(store.getState().maps).toHaveLength(1)
    })
  })

  describe('updateMap', () => {
    it('merges updates into the target map', () => {
      store.getState().addMap(makeMap({ id: 'a', name: 'Old' }))
      store.getState().updateMap('a', { name: 'New' })
      expect(store.getState().maps[0].name).toBe('New')
    })

    it('does not affect other maps', () => {
      store.getState().addMap(makeMap({ id: 'a', name: 'A' }))
      store.getState().addMap(makeMap({ id: 'b', name: 'B' }))
      store.getState().updateMap('a', { name: 'Updated' })
      expect(store.getState().maps[1].name).toBe('B')
    })
  })

  describe('duplicateMap', () => {
    it('returns null for unknown mapId', () => {
      const result = store.getState().duplicateMap('ghost')
      expect(result).toBeNull()
    })

    it('creates a copy with new id and "(Copy)" suffix', () => {
      store.getState().addMap(makeMap({ id: 'orig', name: 'Forest' }))
      const copy = store.getState().duplicateMap('orig')
      expect(copy).not.toBeNull()
      expect(copy!.id).not.toBe('orig')
      expect(copy!.name).toBe('Forest (Copy)')
    })

    it('adds the copy to the maps array', () => {
      store.getState().addMap(makeMap({ id: 'orig', name: 'Forest' }))
      store.getState().duplicateMap('orig')
      expect(store.getState().maps).toHaveLength(2)
    })
  })

  // --- Token actions ---

  describe('addToken', () => {
    it('appends token to the correct map', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      const token = makeToken({ id: 't1' })
      store.getState().addToken('m1', token)
      expect(store.getState().maps[0].tokens).toHaveLength(1)
      expect(store.getState().maps[0].tokens[0].id).toBe('t1')
    })

    it('does not add token to wrong map', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().addMap(makeMap({ id: 'm2' }))
      store.getState().addToken('m2', makeToken({ id: 't1' }))
      expect(store.getState().maps[0].tokens).toHaveLength(0)
    })
  })

  describe('moveToken', () => {
    it('updates gridX and gridY on the token', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().addToken('m1', makeToken({ id: 't1', gridX: 0, gridY: 0 }))
      store.getState().moveToken('m1', 't1', 5, 10)
      const token = store.getState().maps[0].tokens[0]
      expect(token.gridX).toBe(5)
      expect(token.gridY).toBe(10)
    })

    it('syncs mounted rider position when mount moves', () => {
      const mount = makeToken({ id: 'mount', entityId: 'ent-mount', riderId: 'ent-rider', gridX: 0, gridY: 0 })
      const rider = makeToken({ id: 'rider', entityId: 'ent-rider', gridX: 0, gridY: 0 })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [mount, rider] }))
      store.getState().moveToken('m1', 'mount', 3, 3)
      const tokens = store.getState().maps[0].tokens
      const riderToken = tokens.find((t: any) => t.id === 'rider')
      expect(riderToken.gridX).toBe(3)
      expect(riderToken.gridY).toBe(3)
    })

    it('no-op for unknown tokenId', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().addToken('m1', makeToken({ id: 't1', gridX: 1, gridY: 1 }))
      store.getState().moveToken('m1', 'ghost', 9, 9)
      expect(store.getState().maps[0].tokens[0].gridX).toBe(1)
    })
  })

  describe('removeToken', () => {
    it('removes the token from the map', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().addToken('m1', makeToken({ id: 't1' }))
      store.getState().addToken('m1', makeToken({ id: 't2' }))
      store.getState().removeToken('m1', 't1')
      expect(store.getState().maps[0].tokens.map((t: any) => t.id)).toEqual(['t2'])
    })

    it('removing last token yields empty array', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().addToken('m1', makeToken({ id: 't1' }))
      store.getState().removeToken('m1', 't1')
      expect(store.getState().maps[0].tokens).toHaveLength(0)
    })
  })

  describe('updateToken', () => {
    it('merges updates onto token', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().addToken('m1', makeToken({ id: 't1', label: 'Old' }))
      store.getState().updateToken('m1', 't1', { label: 'New' })
      expect(store.getState().maps[0].tokens[0].label).toBe('New')
    })

    it('sets pendingFallDamage when elevation drops >= 10 without flySpeed', () => {
      const token = makeToken({ id: 't1', elevation: 30, flySpeed: 0 })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [token] }))
      store.getState().updateToken('m1', 't1', { elevation: 10 })
      expect(store.getState().pendingFallDamage).toEqual({ tokenId: 't1', mapId: 'm1', height: 20 })
    })

    it('does NOT set pendingFallDamage when elevation drops < 10', () => {
      const token = makeToken({ id: 't1', elevation: 15, flySpeed: 0 })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [token] }))
      store.getState().updateToken('m1', 't1', { elevation: 10 })
      expect(store.getState().pendingFallDamage).toBeNull()
    })

    it('does NOT set pendingFallDamage when token has flySpeed > 0', () => {
      const token = makeToken({ id: 't1', elevation: 40, flySpeed: 30 })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [token] }))
      store.getState().updateToken('m1', 't1', { elevation: 0 })
      expect(store.getState().pendingFallDamage).toBeNull()
    })

    it('force-dismounts rider when mount drops to 0 HP', () => {
      const mount = makeToken({ id: 'mount', entityId: 'ent-mount', riderId: 'ent-rider', currentHP: 10 })
      const rider = makeToken({ id: 'rider', entityId: 'ent-rider' })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [mount, rider] }))
      store.getState().updateToken('m1', 'mount', { currentHP: 0 })
      const mountToken = store.getState().maps[0].tokens.find((t: any) => t.id === 'mount')
      expect(mountToken.riderId).toBeUndefined()
    })

    it('does NOT force-dismount when HP is still above 0', () => {
      const mount = makeToken({ id: 'mount', entityId: 'ent-mount', riderId: 'ent-rider', currentHP: 10 })
      const rider = makeToken({ id: 'rider', entityId: 'ent-rider' })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [mount, rider] }))
      store.getState().updateToken('m1', 'mount', { currentHP: 5 })
      const mountToken = store.getState().maps[0].tokens.find((t: any) => t.id === 'mount')
      expect(mountToken.riderId).toBe('ent-rider')
    })

    it('clears turnState mountedOn when riderId is removed from mount', () => {
      const mount = makeToken({ id: 'mount', entityId: 'ent-mount', riderId: 'ent-rider' })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [mount] }))
      store.setState({
        turnStates: {
          'ent-rider': { entityId: 'ent-rider', mountedOn: 'ent-mount', mountType: 'controlled' }
        }
      })
      store.getState().updateToken('m1', 'mount', { riderId: undefined })
      expect(store.getState().turnStates['ent-rider'].mountedOn).toBeUndefined()
    })
  })

  // --- Audio emitter ---

  describe('toggleEmitterPlaying', () => {
    it('toggles playing from false to true', () => {
      const map = makeMap({ id: 'm1', audioEmitters: [{ id: 'e1', playing: false }] })
      store.getState().addMap(map)
      store.getState().toggleEmitterPlaying('m1', 'e1')
      expect(store.getState().maps[0].audioEmitters[0].playing).toBe(true)
    })

    it('toggles playing from true to false', () => {
      const map = makeMap({ id: 'm1', audioEmitters: [{ id: 'e1', playing: true }] })
      store.getState().addMap(map)
      store.getState().toggleEmitterPlaying('m1', 'e1')
      expect(store.getState().maps[0].audioEmitters[0].playing).toBe(false)
    })

    it('handles emitter with no playing field (treated as false -> true)', () => {
      const map = makeMap({ id: 'm1', audioEmitters: [{ id: 'e1' }] })
      store.getState().addMap(map)
      store.getState().toggleEmitterPlaying('m1', 'e1')
      expect(store.getState().maps[0].audioEmitters[0].playing).toBe(true)
    })
  })

  // --- Selection ---

  describe('selection actions', () => {
    it('setSelectedTokenIds replaces selection', () => {
      store.getState().setSelectedTokenIds(['a', 'b'])
      expect(store.getState().selectedTokenIds).toEqual(['a', 'b'])
    })

    it('addToSelection adds new id', () => {
      store.getState().setSelectedTokenIds(['a'])
      store.getState().addToSelection('b')
      expect(store.getState().selectedTokenIds).toEqual(['a', 'b'])
    })

    it('addToSelection is idempotent — no duplicates', () => {
      store.getState().setSelectedTokenIds(['a'])
      store.getState().addToSelection('a')
      expect(store.getState().selectedTokenIds).toEqual(['a'])
    })

    it('removeFromSelection removes the id', () => {
      store.getState().setSelectedTokenIds(['a', 'b', 'c'])
      store.getState().removeFromSelection('b')
      expect(store.getState().selectedTokenIds).toEqual(['a', 'c'])
    })

    it('removeFromSelection on missing id is safe', () => {
      store.getState().setSelectedTokenIds(['a'])
      store.getState().removeFromSelection('nope')
      expect(store.getState().selectedTokenIds).toEqual(['a'])
    })

    it('clearSelection empties selection', () => {
      store.getState().setSelectedTokenIds(['a', 'b'])
      store.getState().clearSelection()
      expect(store.getState().selectedTokenIds).toEqual([])
    })
  })

  // --- Bulk token actions ---

  describe('revealAllTokens', () => {
    it('sets visibleToPlayers=true on all tokens in active map', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().setActiveMap('m1')
      store.getState().addToken('m1', makeToken({ id: 't1', visibleToPlayers: false }))
      store.getState().addToken('m1', makeToken({ id: 't2', visibleToPlayers: false }))
      store.getState().revealAllTokens()
      const tokens = store.getState().maps[0].tokens
      expect(tokens.every((t: any) => t.visibleToPlayers === true)).toBe(true)
    })

    it('does not affect tokens on inactive maps', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().addMap(makeMap({ id: 'm2' }))
      store.getState().setActiveMap('m1')
      store.getState().addToken('m2', makeToken({ id: 't2', visibleToPlayers: false }))
      store.getState().revealAllTokens()
      expect(store.getState().maps[1].tokens[0].visibleToPlayers).toBe(false)
    })
  })

  // --- Wall segments ---

  describe('wall segment actions', () => {
    const wall = { id: 'w1', x1: 0, y1: 0, x2: 10, y2: 0 }

    it('addWallSegment appends wall', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().addWallSegment('m1', wall)
      expect(store.getState().maps[0].wallSegments).toHaveLength(1)
    })

    it('addWallSegment works when wallSegments is initially undefined', () => {
      const map = { ...makeMap({ id: 'm1' }), wallSegments: undefined }
      store.getState().addMap(map)
      store.getState().addWallSegment('m1', wall)
      expect(store.getState().maps[0].wallSegments).toHaveLength(1)
    })

    it('removeWallSegment removes by id', () => {
      store.getState().addMap(makeMap({ id: 'm1', wallSegments: [wall, { id: 'w2', x1: 1, y1: 1, x2: 2, y2: 2 }] }))
      store.getState().removeWallSegment('m1', 'w1')
      expect(store.getState().maps[0].wallSegments.map((w: any) => w.id)).toEqual(['w2'])
    })

    it('updateWallSegment merges updates', () => {
      store.getState().addMap(makeMap({ id: 'm1', wallSegments: [wall] }))
      store.getState().updateWallSegment('m1', 'w1', { x2: 99 })
      expect(store.getState().maps[0].wallSegments[0].x2).toBe(99)
    })
  })

  // --- Center on entity ---

  describe('center on entity', () => {
    it('requestCenterOnEntity sets centerOnEntityId', () => {
      store.getState().requestCenterOnEntity('ent-99')
      expect(store.getState().centerOnEntityId).toBe('ent-99')
    })

    it('clearCenterRequest resets to null', () => {
      store.getState().requestCenterOnEntity('ent-99')
      store.getState().clearCenterRequest()
      expect(store.getState().centerOnEntityId).toBeNull()
    })
  })

  // --- Pending fall damage ---

  describe('setPendingFallDamage', () => {
    it('sets a pending fall damage record', () => {
      store.getState().setPendingFallDamage({ tokenId: 't1', mapId: 'm1', height: 30 })
      expect(store.getState().pendingFallDamage).toEqual({ tokenId: 't1', mapId: 'm1', height: 30 })
    })

    it('clears pending fall damage when set to null', () => {
      store.getState().setPendingFallDamage({ tokenId: 't1', mapId: 'm1', height: 30 })
      store.getState().setPendingFallDamage(null)
      expect(store.getState().pendingFallDamage).toBeNull()
    })
  })

  // --- Pending placement ---

  describe('pendingPlacement', () => {
    const tokenData = { entityId: 'ent-x', label: 'Hero', visibleToPlayers: true } as any

    it('setPendingPlacement stores tokenData', () => {
      store.getState().setPendingPlacement(tokenData)
      expect(store.getState().pendingPlacement).toEqual({ tokenData })
    })

    it('setPendingPlacement(null) clears it', () => {
      store.getState().setPendingPlacement(tokenData)
      store.getState().setPendingPlacement(null)
      expect(store.getState().pendingPlacement).toBeNull()
    })

    it('commitPlacement adds token to map and clears pendingPlacement', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().setPendingPlacement(tokenData)
      store.getState().commitPlacement('m1', 4, 7)
      expect(store.getState().pendingPlacement).toBeNull()
      const tokens = store.getState().maps[0].tokens
      expect(tokens).toHaveLength(1)
      expect(tokens[0].gridX).toBe(4)
      expect(tokens[0].gridY).toBe(7)
      expect(tokens[0].label).toBe('Hero')
    })

    it('commitPlacement is a no-op when pendingPlacement is null', () => {
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().commitPlacement('m1', 0, 0)
      expect(store.getState().maps[0].tokens).toHaveLength(0)
    })

    it('commitPlacement sets floor to currentFloor', () => {
      store.setState({ currentFloor: 2 })
      store.getState().addMap(makeMap({ id: 'm1' }))
      store.getState().setPendingPlacement(tokenData)
      store.getState().commitPlacement('m1', 0, 0)
      expect(store.getState().maps[0].tokens[0].floor).toBe(2)
    })
  })

  // --- Off-by-one: elevation fall boundary ---

  describe('elevation fall damage boundary', () => {
    it('triggers at exactly 10 ft drop', () => {
      const token = makeToken({ id: 't1', elevation: 10, flySpeed: 0 })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [token] }))
      store.getState().updateToken('m1', 't1', { elevation: 0 })
      expect(store.getState().pendingFallDamage).not.toBeNull()
      expect(store.getState().pendingFallDamage!.height).toBe(10)
    })

    it('does NOT trigger at 9 ft drop', () => {
      const token = makeToken({ id: 't1', elevation: 9, flySpeed: 0 })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [token] }))
      store.getState().updateToken('m1', 't1', { elevation: 0 })
      expect(store.getState().pendingFallDamage).toBeNull()
    })

    it('triggers at 11 ft drop', () => {
      const token = makeToken({ id: 't1', elevation: 11, flySpeed: 0 })
      store.getState().addMap(makeMap({ id: 'm1', tokens: [token] }))
      store.getState().updateToken('m1', 't1', { elevation: 0 })
      expect(store.getState().pendingFallDamage!.height).toBe(11)
    })
  })
})
