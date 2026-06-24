import { describe, expect, it } from 'vitest'
import type { Campaign } from '../../types/campaign'
import { exportCampaign, importCampaign, redactCampaignSecrets } from './campaign-io'

const minimalCampaign: Campaign = {
  id: 'camp-1',
  name: 'Test Campaign',
  description: '',
  system: 'dnd5e',
  type: 'custom',
  dmId: 'dm-1',
  inviteCode: 'ABC123',
  turnMode: 'initiative',
  maps: [],
  npcs: [],
  players: [
    {
      userId: 'p1',
      displayName: 'Alice',
      characterId: null,
      joinedAt: '2025-01-01T00:00:00.000Z',
      isActive: true,
      isReady: true
    }
  ],
  customRules: [],
  settings: {
    maxPlayers: 6,
    lobbyMessage: '',
    levelRange: { min: 1, max: 20 },
    allowCharCreationInLobby: true
  },
  journal: {
    entries: [
      {
        id: 'e1',
        sessionNumber: 1,
        date: '2025-01-01',
        title: 'Session 1',
        content: 'Secret notes',
        isPrivate: true,
        authorId: 'dm-1',
        createdAt: '2025-01-01T00:00:00.000Z'
      }
    ]
  },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z'
}

describe('campaign-io', () => {
  describe('exportCampaign', () => {
    it('preserves players and journal entries', () => {
      const exported = exportCampaign(minimalCampaign)
      const parsed = JSON.parse(exported).campaign
      expect(parsed.players).toEqual(minimalCampaign.players)
      expect(parsed.journal).toEqual(minimalCampaign.journal)
    })
  })

  describe('importCampaign', () => {
    it('succeeds with valid data', () => {
      const exported = exportCampaign(minimalCampaign)
      const imported = importCampaign(exported).campaign
      expect(imported.id).toBe(minimalCampaign.id)
      expect(imported.name).toBe(minimalCampaign.name)
      expect(imported.system).toBe(minimalCampaign.system)
      expect(imported.players).toEqual(minimalCampaign.players)
      expect(imported.journal.entries).toEqual(minimalCampaign.journal.entries)
    })

    it('throws on missing required field', () => {
      const invalid = { ...minimalCampaign }
      delete (invalid as Record<string, unknown>).inviteCode
      const json = JSON.stringify(invalid)
      expect(() => importCampaign(json)).toThrow('missing required field "inviteCode"')
    })
  })
})

describe('campaign export secret redaction', () => {
  const withKeys: Campaign = {
    ...minimalCampaign,
    aiDm: {
      enabled: true,
      provider: 'claude',
      claudeApiKey: 'sk-secret-claude',
      openaiApiKey: 'sk-secret-openai',
      geminiApiKey: 'secret-gemini'
    }
  }

  it('strips AI provider API keys from the exported JSON', () => {
    const json = exportCampaign(withKeys)
    expect(json).not.toContain('sk-secret-claude')
    expect(json).not.toContain('sk-secret-openai')
    expect(json).not.toContain('secret-gemini')
    const parsed = JSON.parse(json)
    expect(parsed.campaign.aiDm.enabled).toBe(true)
    expect(parsed.campaign.aiDm.claudeApiKey).toBeUndefined()
    expect(parsed.campaign.aiDm.openaiApiKey).toBeUndefined()
    expect(parsed.campaign.aiDm.geminiApiKey).toBeUndefined()
  })

  it('does not mutate the source campaign', () => {
    redactCampaignSecrets(withKeys)
    expect(withKeys.aiDm?.claudeApiKey).toBe('sk-secret-claude')
  })

  it('strips leaked keys on import of a pre-redaction file', () => {
    const leaky = JSON.stringify({ campaign: withKeys, gameState: null })
    const { campaign } = importCampaign(leaky)
    expect(campaign.aiDm?.claudeApiKey).toBeUndefined()
    expect(campaign.aiDm?.openaiApiKey).toBeUndefined()
    expect(campaign.aiDm?.geminiApiKey).toBeUndefined()
    expect(campaign.aiDm?.enabled).toBe(true)
  })
})
