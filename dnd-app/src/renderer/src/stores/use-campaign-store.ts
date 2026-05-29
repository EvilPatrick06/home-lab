import { create } from 'zustand'
import { dynamicKeys } from '../constants'
import { BUILTIN_ROLES } from '../data/builtin-roles'
import type { Campaign, CampaignPermissions, PlayerOverride, Role } from '../types/campaign'
import { generateInviteCode } from '../utils/invite-code'
import { logger } from '../utils/logger'

function cleanupCampaignLocalStorage(campaignId: string) {
  localStorage.removeItem(dynamicKeys.lobbyChat(campaignId))
  const versionsKey = dynamicKeys.autosaveVersions(campaignId)
  try {
    const raw = localStorage.getItem(versionsKey)
    if (raw) {
      const versions = JSON.parse(raw) as string[]
      versions.forEach((vid) => {
        localStorage.removeItem(dynamicKeys.autosaveVersion(campaignId, vid))
      })
    }
  } catch {
    // ignore
  }
  localStorage.removeItem(versionsKey)
}

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
  archiveCampaign: (id: string) => Promise<void>
  unarchiveCampaign: (id: string) => Promise<void>
  // Phase 29c/29d — roles + per-player overrides.
  addRole: (campaignId: string, role: Role) => Promise<void>
  updateRole: (campaignId: string, roleId: string, updates: Partial<Role>) => Promise<void>
  deleteRole: (campaignId: string, roleId: string) => Promise<void>
  duplicateRole: (campaignId: string, roleId: string) => Promise<void>
  setPlayerOverride: (campaignId: string, clientId: string, override: PlayerOverride) => Promise<void>
  clearPlayerOverride: (campaignId: string, clientId: string) => Promise<void>
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

      // QA-S7 migration: if a campaign predates the inviteCode field, mint
      // one and persist it back so subsequent host-starts reuse the same
      // code instead of regenerating per session. Without this, older
      // saves (e.g. anything created before invite codes were introduced
      // and any campaign saved with a falsy inviteCode field) would get
      // a fresh code every time host-manager fell through to
      // `generateInviteCode()`.
      const migrated: Campaign[] = []
      for (const raw of diskCampaigns) {
        // Phase 29h — inject default permissions for pre-permissions saves.
        const campaign = raw.permissions
          ? raw
          : { ...raw, permissions: { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} } }
        if (!campaign.inviteCode || typeof campaign.inviteCode !== 'string') {
          const repaired = { ...campaign, inviteCode: generateInviteCode() }
          migrated.push(repaired)
          window.api.saveCampaign(repaired as unknown as Record<string, unknown>).catch((err) => {
            logger.warn(`Failed to persist migrated inviteCode for campaign ${campaign.id}:`, err)
          })
        } else {
          migrated.push(campaign)
        }
      }

      set((state) => {
        const diskIds = new Set(migrated.map((c) => c.id))
        const inMemoryOnly = state.campaigns.filter((c) => !diskIds.has(c.id))
        return { campaigns: [...migrated, ...inMemoryOnly], loading: false }
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
      cleanupCampaignLocalStorage(id)
    } catch (error) {
      logger.error('Failed to delete campaign:', error)
    }
  },

  deleteAllCampaigns: async () => {
    const { campaigns } = get()
    for (const c of campaigns) {
      try {
        await window.api.deleteCampaign(c.id)
        cleanupCampaignLocalStorage(c.id)
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
      // Phase 29b — seed a per-campaign copy of the built-in roles.
      permissions: { roles: structuredClone(BUILTIN_ROLES), playerOverrides: {} },
      createdAt: now,
      updatedAt: now
    }

    await get().saveCampaign(campaign)
    return campaign
  },

  archiveCampaign: async (id: string) => {
    const campaign = get().campaigns.find((c) => c.id === id)
    if (!campaign) return
    const updated = { ...campaign, archived: true, updatedAt: new Date().toISOString() }
    await get().saveCampaign(updated)
  },

  unarchiveCampaign: async (id: string) => {
    const campaign = get().campaigns.find((c) => c.id === id)
    if (!campaign) return
    const updated = { ...campaign, archived: false, updatedAt: new Date().toISOString() }
    await get().saveCampaign(updated)
  },

  // ── Phase 29c/29d — permissions ──
  addRole: async (campaignId, role) => {
    await mutatePermissions(get, campaignId, (perms) => {
      if (perms.roles.some((r) => r.id === role.id)) return perms
      return { ...perms, roles: [...perms.roles, role] }
    })
  },

  updateRole: async (campaignId, roleId, updates) => {
    await mutatePermissions(get, campaignId, (perms) => ({
      ...perms,
      roles: perms.roles.map((r) => (r.id === roleId ? { ...r, ...updates, id: r.id, isBuiltIn: r.isBuiltIn } : r))
    }))
  },

  deleteRole: async (campaignId, roleId) => {
    await mutatePermissions(get, campaignId, (perms) => {
      const role = perms.roles.find((r) => r.id === roleId)
      if (!role || role.isBuiltIn) throw new Error('Cannot delete a built-in role')
      // Reassign any per-player override holders? Overrides aren't role-keyed; peers
      // referencing this role fall back to role-player via resolvePeerRoleId.
      return { ...perms, roles: perms.roles.filter((r) => r.id !== roleId) }
    })
  },

  duplicateRole: async (campaignId, roleId) => {
    await mutatePermissions(get, campaignId, (perms) => {
      const role = perms.roles.find((r) => r.id === roleId)
      if (!role) return perms
      const copy: Role = {
        ...role,
        id: `role-${crypto.randomUUID().slice(0, 8)}`,
        name: `${role.name} (Copy)`,
        isBuiltIn: false,
        permissions: [...role.permissions]
      }
      return { ...perms, roles: [...perms.roles, copy] }
    })
  },

  setPlayerOverride: async (campaignId, clientId, override) => {
    await mutatePermissions(get, campaignId, (perms) => ({
      ...perms,
      playerOverrides: { ...perms.playerOverrides, [clientId]: override }
    }))
  },

  clearPlayerOverride: async (campaignId, clientId) => {
    await mutatePermissions(get, campaignId, (perms) => {
      const next = { ...perms.playerOverrides }
      delete next[clientId]
      return { ...perms, playerOverrides: next }
    })
  }
}))

/** Phase 29c — apply a permissions mutation to a campaign and persist. */
async function mutatePermissions(
  get: () => CampaignState,
  campaignId: string,
  fn: (perms: CampaignPermissions) => CampaignPermissions
): Promise<void> {
  const campaign = get().campaigns.find((c) => c.id === campaignId)
  if (!campaign) return
  const current: CampaignPermissions = campaign.permissions ?? {
    roles: structuredClone(BUILTIN_ROLES),
    playerOverrides: {}
  }
  const updated = { ...campaign, permissions: fn(current), updatedAt: new Date().toISOString() }
  await get().saveCampaign(updated)
}
