import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock sound-manager
vi.mock('../sound-manager', () => ({
  play: vi.fn(),
  playAmbient: vi.fn(),
  stopAmbient: vi.fn()
}))

// Mock light-sources data
vi.mock('../../data/light-sources', () => ({
  LIGHT_SOURCES: {
    torch: { brightRadius: 4, dimRadius: 8, durationSeconds: 3600 },
    lantern: { brightRadius: 6, dimRadius: 12, durationSeconds: 21600 }
  }
}))

// Mock name-resolver
vi.mock('./name-resolver', () => ({
  resolveTokenByLabel: vi.fn((tokens: Array<{ label: string; entityId: string }>, label: string) =>
    tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  )
}))

import type { ActiveMap, DmAction, StoreAccessors } from './types'

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    revealFog: vi.fn(),
    hideFog: vi.fn(),
    setAmbientLight: vi.fn(),
    setUnderwaterCombat: vi.fn(),
    setTravelPace: vi.fn(),
    lightSource: vi.fn(),
    extinguishSource: vi.fn(),
    setWeatherOverride: vi.fn(),
    setMoonOverride: vi.fn(),
    activeLightSources: [],
    ...overrides
  } as unknown as ReturnType<ReturnType<StoreAccessors['getGameStore']>['getState']>
}

function makeStores(): StoreAccessors {
  return {
    getGameStore: vi.fn(() => ({ getState: vi.fn() })) as unknown as StoreAccessors['getGameStore'],
    getLobbyStore: vi.fn(() => ({ getState: vi.fn() })) as unknown as StoreAccessors['getLobbyStore'],
    getNetworkStore: vi.fn(
      () =>
        ({
          getState: () => ({ sendMessage: vi.fn() })
        }) as unknown
    ) as StoreAccessors['getNetworkStore']
  }
}

function makeActiveMap(tokens: Array<{ id: string; entityId: string; label: string }> = []): ActiveMap {
  return { id: 'map-1', name: 'Test Map', tokens } as unknown as ActiveMap
}

describe('visibility-actions', () => {
  let stores: StoreAccessors

  beforeEach(() => {
    vi.clearAllMocks()
    stores = makeStores()
  })

  describe('executeRevealFog', () => {
    it('reveals fog on the active map and broadcasts', async () => {
      const { executeRevealFog } = await import('./visibility-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'reveal_fog', cells: [{ x: 1, y: 2 }] }
      const result = executeRevealFog(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.revealFog).toHaveBeenCalledWith('map-1', [{ x: 1, y: 2 }])
    })

    it('throws if no active map', async () => {
      const { executeRevealFog } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'reveal_fog', cells: [{ x: 0, y: 0 }] }
      expect(() => executeRevealFog(action, gs, undefined, stores)).toThrow('No active map')
    })

    it('throws if cells is not an array', async () => {
      const { executeRevealFog } = await import('./visibility-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'reveal_fog', cells: 'bad' }
      expect(() => executeRevealFog(action, gs, map, stores)).toThrow('Missing cells array')
    })
  })

  describe('executeHideFog', () => {
    it('hides fog on the active map', async () => {
      const { executeHideFog } = await import('./visibility-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'hide_fog', cells: [{ x: 3, y: 4 }] }
      const result = executeHideFog(action, gs, map, stores)
      expect(result).toBe(true)
      expect(gs.hideFog).toHaveBeenCalledWith('map-1', [{ x: 3, y: 4 }])
    })

    it('throws if no active map', async () => {
      const { executeHideFog } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'hide_fog', cells: [] }
      expect(() => executeHideFog(action, gs, undefined, stores)).toThrow('No active map')
    })
  })

  describe('executeSetAmbientLight', () => {
    it('sets ambient light to a valid level', async () => {
      const { executeSetAmbientLight } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_ambient_light', level: 'dim' }
      expect(executeSetAmbientLight(action, gs)).toBe(true)
      expect(gs.setAmbientLight).toHaveBeenCalledWith('dim')
    })

    it('throws on invalid light level', async () => {
      const { executeSetAmbientLight } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_ambient_light', level: 'blinding' }
      expect(() => executeSetAmbientLight(action, gs)).toThrow('Invalid light level')
    })
  })

  describe('executeSetUnderwaterCombat', () => {
    it('sets underwater combat flag', async () => {
      const { executeSetUnderwaterCombat } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_underwater_combat', enabled: true }
      expect(executeSetUnderwaterCombat(action, gs)).toBe(true)
      expect(gs.setUnderwaterCombat).toHaveBeenCalledWith(true)
    })
  })

  describe('executeSetTravelPace', () => {
    it('sets travel pace', async () => {
      const { executeSetTravelPace } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_travel_pace', pace: 'slow' }
      expect(executeSetTravelPace(action, gs)).toBe(true)
      expect(gs.setTravelPace).toHaveBeenCalledWith('slow')
    })

    it('accepts null pace', async () => {
      const { executeSetTravelPace } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_travel_pace', pace: null }
      expect(executeSetTravelPace(action, gs)).toBe(true)
      expect(gs.setTravelPace).toHaveBeenCalledWith(null)
    })
  })

  describe('executeLightSource', () => {
    it('activates a known light source', async () => {
      const { executeLightSource } = await import('./visibility-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Fighter' }])
      const action: DmAction = { action: 'light_source', entityName: 'Fighter', sourceName: 'Torch' }
      expect(executeLightSource(action, gs, map, stores)).toBe(true)
      expect(gs.lightSource).toHaveBeenCalledWith('e1', 'Fighter', 'torch', 3600)
    })

    it('throws on unknown light source', async () => {
      const { executeLightSource } = await import('./visibility-actions')
      const gs = makeGameStore()
      const map = makeActiveMap([{ id: 't1', entityId: 'e1', label: 'Fighter' }])
      const action: DmAction = { action: 'light_source', entityName: 'Fighter', sourceName: 'Neon Sign' }
      expect(() => executeLightSource(action, gs, map, stores)).toThrow('Unknown light source')
    })

    it('throws if entityName or sourceName missing', async () => {
      const { executeLightSource } = await import('./visibility-actions')
      const gs = makeGameStore()
      const map = makeActiveMap()
      const action: DmAction = { action: 'light_source', entityName: '', sourceName: '' }
      expect(() => executeLightSource(action, gs, map, stores)).toThrow('Missing entityName or sourceName')
    })
  })

  describe('executeExtinguishSource', () => {
    it('extinguishes an active light source', async () => {
      const { executeExtinguishSource } = await import('./visibility-actions')
      const gs = makeGameStore({
        activeLightSources: [{ id: 'ls1', entityName: 'Fighter', sourceName: 'torch' }]
      })
      const action: DmAction = { action: 'extinguish_source', entityName: 'Fighter' }
      expect(executeExtinguishSource(action, gs, undefined, stores)).toBe(true)
      expect(gs.extinguishSource).toHaveBeenCalledWith('ls1')
    })

    it('throws if no matching light source found', async () => {
      const { executeExtinguishSource } = await import('./visibility-actions')
      const gs = makeGameStore({ activeLightSources: [] })
      const action: DmAction = { action: 'extinguish_source', entityName: 'Nobody' }
      expect(() => executeExtinguishSource(action, gs, undefined, stores)).toThrow('No active light source found')
    })

    it('throws if entityName is missing', async () => {
      const { executeExtinguishSource } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'extinguish_source', entityName: '' }
      expect(() => executeExtinguishSource(action, gs, undefined, stores)).toThrow('Missing entityName')
    })
  })

  describe('executeSoundEffect', () => {
    it('plays a sound effect and returns true', async () => {
      const { executeSoundEffect } = await import('./visibility-actions')
      const { play } = await import('../sound-manager')
      const action: DmAction = { action: 'sound_effect', sound: 'sword-hit' }
      expect(executeSoundEffect(action)).toBe(true)
      expect(play).toHaveBeenCalledWith('sword-hit')
    })

    it('returns true even without a sound', async () => {
      const { executeSoundEffect } = await import('./visibility-actions')
      const action: DmAction = { action: 'sound_effect' }
      expect(executeSoundEffect(action)).toBe(true)
    })
  })

  describe('executePlayAmbient', () => {
    it('plays ambient sound', async () => {
      const { executePlayAmbient } = await import('./visibility-actions')
      const { playAmbient } = await import('../sound-manager')
      const action: DmAction = { action: 'play_ambient', loop: 'forest' }
      expect(executePlayAmbient(action)).toBe(true)
      expect(playAmbient).toHaveBeenCalledWith('forest')
    })
  })

  describe('executeStopAmbient', () => {
    it('stops ambient sound', async () => {
      const { executeStopAmbient } = await import('./visibility-actions')
      const { stopAmbient } = await import('../sound-manager')
      expect(executeStopAmbient()).toBe(true)
      expect(stopAmbient).toHaveBeenCalled()
    })
  })

  describe('executeSetWeather', () => {
    it('sets weather override with all fields', async () => {
      const { executeSetWeather } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = {
        action: 'set_weather',
        description: 'Heavy rain',
        temperature: 55,
        temperatureUnit: 'F',
        windSpeed: '25 mph',
        mechanicalEffects: ['difficult terrain']
      }
      expect(executeSetWeather(action, gs)).toBe(true)
      expect(gs.setWeatherOverride).toHaveBeenCalledWith({
        description: 'Heavy rain',
        temperature: 55,
        temperatureUnit: 'F',
        windSpeed: '25 mph',
        mechanicalEffects: ['difficult terrain']
      })
    })

    it('throws if description is missing', async () => {
      const { executeSetWeather } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_weather', description: '' }
      expect(() => executeSetWeather(action, gs)).toThrow('Missing weather description')
    })
  })

  describe('executeClearWeather', () => {
    it('clears weather override', async () => {
      const { executeClearWeather } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'clear_weather' }
      expect(executeClearWeather(action, gs)).toBe(true)
      expect(gs.setWeatherOverride).toHaveBeenCalledWith(null)
    })
  })

  describe('executeSetMoon', () => {
    it('sets moon phase', async () => {
      const { executeSetMoon } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_moon', phase: 'full' }
      expect(executeSetMoon(action, gs)).toBe(true)
      expect(gs.setMoonOverride).toHaveBeenCalledWith('full')
    })

    it('throws if phase is missing', async () => {
      const { executeSetMoon } = await import('./visibility-actions')
      const gs = makeGameStore()
      const action: DmAction = { action: 'set_moon', phase: '' }
      expect(() => executeSetMoon(action, gs)).toThrow('Missing moon phase')
    })
  })
})
