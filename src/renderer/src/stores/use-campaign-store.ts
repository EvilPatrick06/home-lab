import { create } from 'zustand'
import type { Campaign } from '../types/campaign'
import { generateInviteCode } from '../utils/invite-code'
import { logger } from '../utils/logger'

function generateId(): string {
  return crypto.randomUUID()
}

interface CampaignState {
  campaigns: Campaign[]
  activeCampaignId: string | null
  loading: boolean
  loadCampaigns: () => Promise<void>
  saveCampaign: (campaign: Campaign) => Promise<void>
  deleteCampaign: (id: string) => Promise<void>
  deleteAllCampaigns: () => Promise<void>
  setActiveCampaign: (id: string | null) => void
  getActiveCampaign: () => Campaign | null
  addCampaignToState: (campaign: Campaign) => void
  createCampaign: (
    data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'inviteCode' | 'players' | 'journal'>
  ) => Promise<Campaign>
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  activeCampaignId: null,
  loading: false,

  loadCampaigns: async () => {
    set({ loading: true })
    try {
      const rawData = await window.api.loadCampaigns()
      if (!Array.isArray(rawData)) {
        const err = rawData as { success?: boolean; error?: string } | undefined
        logger.error('Failed to load campaigns:', err?.error ?? 'unexpected response')
        set({ loading: false })
        return
      }
      const diskCampaigns = rawData.filter(
        (c) => c != null && typeof c === 'object' && typeof (c as Record<string, unknown>).id === 'string'
      ) as unknown as Campaign[]
      set((state) => {
        const diskIds = new Set(diskCampaigns.map((c) => c.id))
        const inMemoryOnly = state.campaigns.filter((c) => !diskIds.has(c.id))
        return { campaigns: [...diskCampaigns, ...inMemoryOnly], loading: false }
      })
    } catch (error) {
      logger.error('Failed to load campaigns:', error)
      set({ loading: false })
    }
  },

  saveCampaign: async (campaign: Campaign) => {
    try {
      await window.api.saveCampaign(campaign as unknown as Record<string, unknown>)
      const { campaigns } = get()
      const index = campaigns.findIndex((c) => c.id === campaign.id)
      if (index >= 0) {
        const updated = [...campaigns]
        updated[index] = campaign
        set({ campaigns: updated })
      } else {
        set({ campaigns: [...campaigns, campaign] })
      }
    } catch (error) {
      logger.error('Failed to save campaign:', error)
    }
  },

  deleteCampaign: async (id: string) => {
    try {
      await window.api.deleteCampaign(id)
      const { activeCampaignId } = get()
      set({
        campaigns: get().campaigns.filter((c) => c.id !== id),
        activeCampaignId: activeCampaignId === id ? null : activeCampaignId
      })
    } catch (error) {
      logger.error('Failed to delete campaign:', error)
    }
  },

  deleteAllCampaigns: async () => {
    const { campaigns } = get()
    for (const c of campaigns) {
      try {
        await window.api.deleteCampaign(c.id)
      } catch (error) {
        logger.error('Failed to delete campaign:', c.id, error)
      }
    }
    set({ campaigns: [], activeCampaignId: null })
  },

  setActiveCampaign: (id) => set({ activeCampaignId: id }),

  addCampaignToState: (campaign: Campaign) => {
    set((state) => {
      const exists = state.campaigns.some((c) => c.id === campaign.id)
      if (exists) return state
      return { campaigns: [...state.campaigns, campaign] }
    })
  },

  getActiveCampaign: () => {
    const { campaigns, activeCampaignId } = get()
    if (!activeCampaignId) return null
    return campaigns.find((c) => c.id === activeCampaignId) ?? null
  },

  createCampaign: async (data) => {
    const now = new Date().toISOString()
    const campaign: Campaign = {
      ...data,
      id: generateId(),
      inviteCode: generateInviteCode(),
      players: [],
      journal: { entries: [] },
      createdAt: now,
      updatedAt: now
    }

    await get().saveCampaign(campaign)
    return campaign
  }
}))
