import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BattlemapSpecSchema } from '../../../../../shared/battlemap-spec'
import type { StoreAccessors } from '../../game-actions/types'
import { applyBattlemapSpec } from './apply-spec'

function spec(over: Record<string, unknown> = {}): import('../../../../../shared/battlemap-spec').BattlemapSpec {
  return BattlemapSpecSchema.parse({
    name: 'Crypt',
    theme: 'crypt',
    width: 16,
    height: 16,
    ambientLight: 'darkness',
    rooms: [{ id: 'r1', x: 2, y: 2, w: 6, h: 6 }],
    lights: [{ x: 4, y: 4, kind: 'torch' }],
    spawns: { party: { x: 3, y: 3 }, enemies: [{ x: 5, y: 5, label: 'Skeleton' }] },
    ...over
  })
}

function makeStores(inGameTime: unknown = { totalSeconds: 100 }) {
  const addMap = vi.fn()
  const lightSource = vi.fn()
  const setActiveMap = vi.fn()
  const setAmbientLight = vi.fn()
  const sendMessage = vi.fn()
  const addChatMessage = vi.fn()
  const gameStore = { addMap, lightSource, setActiveMap, setAmbientLight, inGameTime, maps: [] }
  const stores = {
    getGameStore: () => ({ getState: () => gameStore }),
    getNetworkStore: () => ({ getState: () => ({ sendMessage }) }),
    getLobbyStore: () => ({ getState: () => ({ addChatMessage }) })
  } as unknown as StoreAccessors
  return { stores, addMap, lightSource, setActiveMap, setAmbientLight, sendMessage, addChatMessage }
}

const noCanvas = () => ({ getContext: () => null }) as unknown as HTMLCanvasElement

beforeEach(() => vi.clearAllMocks())

describe('applyBattlemapSpec (PHASE-34 34E)', () => {
  it('adds a map with fog enabled + compiled walls/terrain/pins', () => {
    const { stores, addMap } = makeStores()
    applyBattlemapSpec(spec(), { campaignId: 'c1', switchTo: false, stores, createCanvas: noCanvas })
    expect(addMap).toHaveBeenCalledTimes(1)
    const map = addMap.mock.calls[0][0] as { fogOfWar: { enabled: boolean }; wallSegments: unknown[]; pins: unknown[] }
    expect(map.fogOfWar.enabled).toBe(true)
    expect(map.wallSegments.length).toBeGreaterThan(0)
    expect(map.pins.length).toBeGreaterThanOrEqual(2) // party + enemy
  })

  it('lights the fixtures (Infinity duration) + broadcasts a light update', () => {
    const { stores, lightSource, sendMessage } = makeStores()
    applyBattlemapSpec(spec(), { campaignId: 'c1', switchTo: false, stores, createCanvas: noCanvas })
    expect(lightSource).toHaveBeenCalledTimes(1)
    expect(lightSource.mock.calls[0][3]).toBe(Number.POSITIVE_INFINITY)
    expect(sendMessage).toHaveBeenCalledWith('dm:light-source-update', expect.objectContaining({ action: 'light' }))
  })

  it('switchTo:false leaves active map + ambient untouched', () => {
    const { stores, setActiveMap, setAmbientLight } = makeStores()
    applyBattlemapSpec(spec(), { campaignId: 'c1', switchTo: false, stores, createCanvas: noCanvas })
    expect(setActiveMap).not.toHaveBeenCalled()
    expect(setAmbientLight).not.toHaveBeenCalled()
  })

  it('switchTo:true switches map + sets ambient', () => {
    const { stores, setActiveMap, setAmbientLight } = makeStores()
    applyBattlemapSpec(spec(), { campaignId: 'c1', switchTo: true, stores, createCanvas: noCanvas })
    expect(setActiveMap).toHaveBeenCalledTimes(1)
    expect(setAmbientLight).toHaveBeenCalledWith('darkness')
  })

  it('null in-game time warns instead of throwing (lights deferred)', () => {
    const { stores, lightSource } = makeStores(null)
    const res = applyBattlemapSpec(spec(), { campaignId: 'c1', switchTo: false, stores, createCanvas: noCanvas })
    expect(lightSource).not.toHaveBeenCalled()
    expect(res.warnings.some((w) => /in-game time/i.test(w))).toBe(true)
  })
})
