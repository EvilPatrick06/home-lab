import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

const state = {
  campaigns: [{ id: 'c1', aiDm: { allowMapGeneration: true } }] as Array<{
    id: string
    aiDm: { allowMapGeneration?: boolean }
  }>
}
const { applyBattlemapSpec, postDmMessage, generateBattlemap } = vi.hoisted(() => ({
  applyBattlemapSpec: vi.fn(),
  postDmMessage: vi.fn(),
  generateBattlemap: vi.fn()
}))

vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: { getState: () => ({ campaigns: state.campaigns }) }
}))
vi.mock('../active-campaign-ref', () => ({ getActiveCampaignId: () => 'c1' }))
vi.mock('../map/battlemap/apply-spec', () => ({ applyBattlemapSpec }))
vi.mock('./broadcast-helpers', () => ({ postDmMessage }))

import { executeGenerateBattlemap } from './battlemap-actions'

const action = { action: 'generate_battlemap', description: 'a crypt', theme: 'crypt' } as unknown as DmAction
const gs = {} as GameStoreSnapshot
const map = {} as ActiveMap
const stores = {} as StoreAccessors
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  state.campaigns = [{ id: 'c1', aiDm: { allowMapGeneration: true } }]
  generateBattlemap.mockResolvedValue({ success: true, spec: { name: 'X' }, warnings: [] })
  vi.stubGlobal('window', { api: { ai: { generateBattlemap } } })
})

describe('executeGenerateBattlemap (PHASE-34 34H)', () => {
  it('throws (and never calls the API) when allowMapGeneration is off', () => {
    state.campaigns = [{ id: 'c1', aiDm: { allowMapGeneration: false } }]
    expect(() => executeGenerateBattlemap(action, gs, map, stores)).toThrow(/disabled/i)
    expect(generateBattlemap).not.toHaveBeenCalled()
  })

  it('flag on → kicks off generation with the description/theme', async () => {
    expect(executeGenerateBattlemap(action, gs, map, stores)).toBe(true)
    await flush()
    expect(generateBattlemap).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'c1', prompt: 'a crypt', theme: 'crypt' })
    )
    expect(applyBattlemapSpec).toHaveBeenCalledTimes(1)
  })

  it('rejects a concurrent generation (single-flight)', async () => {
    let release!: () => void
    generateBattlemap.mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ success: true, spec: { name: 'X' }, warnings: [] })
        })
    )
    expect(executeGenerateBattlemap(action, gs, map, stores)).toBe(true)
    expect(() => executeGenerateBattlemap(action, gs, map, stores)).toThrow(/already generating/i)
    release()
    await flush()
  })

  it('a generation failure posts a DM message and never throws asynchronously', async () => {
    generateBattlemap.mockResolvedValue({ success: false, error: 'no provider' })
    expect(executeGenerateBattlemap(action, gs, map, stores)).toBe(true)
    await flush()
    expect(applyBattlemapSpec).not.toHaveBeenCalled()
    expect(postDmMessage).toHaveBeenCalledWith(stores, 'genmap', expect.stringContaining('no provider'), true)
  })
})
