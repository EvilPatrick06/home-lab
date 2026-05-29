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

  // Phase 29c/29d — role CRUD + overrides.
  describe('permissions actions', () => {
    const seed = (): void => {
      useCampaignStore.setState({
        campaigns: [{ id: 'camp1', name: 'C', permissions: undefined } as never]
      })
    }

    it('addRole seeds built-ins then appends a custom role', async () => {
      seed()
      await useCampaignStore.getState().addRole('camp1', {
        id: 'role-x',
        name: 'X',
        isBuiltIn: false,
        permissions: ['roll_dice']
      })
      const perms = useCampaignStore.getState().campaigns[0].permissions
      expect(perms?.roles.some((r) => r.id === 'role-dm')).toBe(true)
      expect(perms?.roles.some((r) => r.id === 'role-x')).toBe(true)
    })

    it('deleteRole rejects built-ins', async () => {
      seed()
      await useCampaignStore.getState().addRole('camp1', { id: 'role-y', name: 'Y', isBuiltIn: false, permissions: [] })
      await expect(useCampaignStore.getState().deleteRole('camp1', 'role-dm')).rejects.toThrow()
      await useCampaignStore.getState().deleteRole('camp1', 'role-y')
      expect(useCampaignStore.getState().campaigns[0].permissions?.roles.some((r) => r.id === 'role-y')).toBe(false)
    })

    it('setPlayerOverride / clearPlayerOverride round-trip', async () => {
      seed()
      await useCampaignStore.getState().setPlayerOverride('camp1', 'cid', { grant: ['view_hidden_tokens'], deny: [] })
      expect(useCampaignStore.getState().campaigns[0].permissions?.playerOverrides.cid?.grant).toContain(
        'view_hidden_tokens'
      )
      await useCampaignStore.getState().clearPlayerOverride('camp1', 'cid')
      expect(useCampaignStore.getState().campaigns[0].permissions?.playerOverrides.cid).toBeUndefined()
    })
  })
})
