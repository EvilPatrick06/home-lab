import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {
  api: {
    storage: {},
    game: {},
    loadCampaigns: vi.fn().mockResolvedValue([]),
    saveCampaign: vi.fn().mockResolvedValue({ success: true }),
    deleteCampaign: vi.fn().mockResolvedValue({ success: true })
  }
})

import { useCampaignStore } from './use-campaign-store'

describe('useCampaignStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-campaign-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useCampaignStore).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = useCampaignStore.getState()
    expect(state).toHaveProperty('campaigns')
    expect(state).toHaveProperty('activeCampaignId')
    expect(state).toHaveProperty('loading')
  })

  it('has expected initial state values', () => {
    const state = useCampaignStore.getState()
    expect(state.campaigns).toEqual([])
    expect(state.activeCampaignId).toBeNull()
    expect(state.loading).toBe(false)
  })

  it('has expected actions', () => {
    const state = useCampaignStore.getState()
    expect(typeof state.loadCampaigns).toBe('function')
    expect(typeof state.saveCampaign).toBe('function')
    expect(typeof state.deleteCampaign).toBe('function')
    expect(typeof state.deleteAllCampaigns).toBe('function')
    expect(typeof state.setActiveCampaign).toBe('function')
    expect(typeof state.getActiveCampaign).toBe('function')
    expect(typeof state.addCampaignToState).toBe('function')
    expect(typeof state.createCampaign).toBe('function')
  })

  it('getActiveCampaign returns null when no campaign is active', () => {
    const state = useCampaignStore.getState()
    expect(state.getActiveCampaign()).toBeNull()
  })
})
