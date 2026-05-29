import { describe, expect, it } from 'vitest'
import {
  ActiveCreatureSchema,
  AiChatRequestSchema,
  AiConfigSchema,
  InitiativeSyncSchema,
  SyncEventSchema
} from './ipc-schemas'

describe('ipc-schemas', () => {
  describe('AiConfigSchema', () => {
    it('should accept valid config with provider and model', () => {
      const result = AiConfigSchema.safeParse({
        provider: 'ollama',
        model: 'llama3',
        ollamaUrl: 'http://localhost:11434'
      })
      expect(result.success).toBe(true)
    })

    it('should accept config with cloud provider', () => {
      const result = AiConfigSchema.safeParse({
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        claudeApiKey: 'sk-ant-test'
      })
      expect(result.success).toBe(true)
    })

    it('should default provider to ollama', () => {
      const result = AiConfigSchema.safeParse({
        model: 'llama3',
        ollamaUrl: 'http://localhost:11434'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.provider).toBe('ollama')
      }
    })

    it('should reject missing model', () => {
      const result = AiConfigSchema.safeParse({
        provider: 'ollama',
        ollamaUrl: 'http://localhost:11434'
      })
      expect(result.success).toBe(false)
    })

    it('should reject non-string model', () => {
      const result = AiConfigSchema.safeParse({
        provider: 'ollama',
        model: 123,
        ollamaUrl: 'http://localhost:11434'
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid provider', () => {
      const result = AiConfigSchema.safeParse({
        provider: 'invalid',
        model: 'llama3'
      })
      expect(result.success).toBe(false)
    })
  })

  describe('ActiveCreatureSchema', () => {
    it('should accept valid active creature', () => {
      const result = ActiveCreatureSchema.safeParse({
        label: 'Goblin 1',
        currentHP: 7,
        maxHP: 12,
        ac: 15,
        conditions: ['poisoned']
      })
      expect(result.success).toBe(true)
    })

    it('should accept creature with optional monsterStatBlockId', () => {
      const result = ActiveCreatureSchema.safeParse({
        label: 'Dragon',
        currentHP: 200,
        maxHP: 200,
        ac: 19,
        conditions: [],
        monsterStatBlockId: 'adult-red-dragon'
      })
      expect(result.success).toBe(true)
    })

    it('should reject missing required fields', () => {
      const result = ActiveCreatureSchema.safeParse({
        label: 'Goblin'
      })
      expect(result.success).toBe(false)
    })

    it('should reject non-array conditions', () => {
      const result = ActiveCreatureSchema.safeParse({
        label: 'Goblin',
        currentHP: 7,
        maxHP: 12,
        ac: 15,
        conditions: 'poisoned'
      })
      expect(result.success).toBe(false)
    })
  })

  describe('AiChatRequestSchema', () => {
    it('should accept valid chat request', () => {
      const result = AiChatRequestSchema.safeParse({
        campaignId: '12345678-1234-1234-1234-123456789abc',
        message: 'What do I see?',
        characterIds: ['char-1', 'char-2']
      })
      expect(result.success).toBe(true)
    })

    it('should accept request with all optional fields', () => {
      const result = AiChatRequestSchema.safeParse({
        campaignId: 'campaign-id',
        message: 'Attack the goblin',
        characterIds: ['char-1'],
        senderName: 'Player 1',
        activeCreatures: [{ label: 'Goblin', currentHP: 7, maxHP: 12, ac: 15, conditions: [] }],
        gameState: 'combat'
      })
      expect(result.success).toBe(true)
    })

    it('should reject missing campaignId', () => {
      const result = AiChatRequestSchema.safeParse({
        message: 'Hello',
        characterIds: []
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing message', () => {
      const result = AiChatRequestSchema.safeParse({
        campaignId: 'id',
        characterIds: []
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing characterIds', () => {
      const result = AiChatRequestSchema.safeParse({
        campaignId: 'id',
        message: 'Hello'
      })
      expect(result.success).toBe(false)
    })

    it('should reject non-array characterIds', () => {
      const result = AiChatRequestSchema.safeParse({
        campaignId: 'id',
        message: 'Hello',
        characterIds: 'not-array'
      })
      expect(result.success).toBe(false)
    })
  })

  describe('module exports', () => {
    it('should export all schemas and types', async () => {
      const mod = await import('./ipc-schemas')
      expect(mod.AiConfigSchema).toBeDefined()
      expect(mod.AiChatRequestSchema).toBeDefined()
      expect(mod.ActiveCreatureSchema).toBeDefined()
      expect(mod.SyncEventSchema).toBeDefined()
      expect(mod.InitiativeSyncSchema).toBeDefined()
    })
  })

  describe('SyncEventSchema (Phase 28a.3)', () => {
    it('accepts a discord_message event', () => {
      const result = SyncEventSchema.safeParse({
        type: 'discord_message',
        timestamp: 1_700_000_000_000,
        payload: { text: 'hi', author: 'alice' }
      })
      expect(result.success).toBe(true)
    })

    it('accepts a discord_roll event', () => {
      const result = SyncEventSchema.safeParse({
        type: 'discord_roll',
        timestamp: 1_700_000_000_000,
        payload: { formula: '1d20+5', total: 18, rolls: [13], rollerName: 'alice' }
      })
      expect(result.success).toBe(true)
    })

    it('accepts a player_join event', () => {
      const result = SyncEventSchema.safeParse({
        type: 'player_join',
        timestamp: 1_700_000_000_000,
        payload: { playerId: 'p1', playerName: 'Alice' }
      })
      expect(result.success).toBe(true)
    })

    it('accepts a state_request event with empty payload', () => {
      const result = SyncEventSchema.safeParse({
        type: 'state_request',
        timestamp: 1_700_000_000_000,
        payload: {}
      })
      expect(result.success).toBe(true)
    })

    it('rejects an unknown event type', () => {
      const result = SyncEventSchema.safeParse({
        type: 'unknown_type',
        timestamp: 1,
        payload: {}
      })
      expect(result.success).toBe(false)
    })

    it('rejects a negative timestamp', () => {
      const result = SyncEventSchema.safeParse({
        type: 'discord_message',
        timestamp: -1,
        payload: { text: 'x' }
      })
      expect(result.success).toBe(false)
    })

    it('rejects a discord_roll missing the formula', () => {
      const result = SyncEventSchema.safeParse({
        type: 'discord_roll',
        timestamp: 1,
        payload: { total: 5 }
      })
      expect(result.success).toBe(false)
    })
  })

  describe('InitiativeSyncSchema (Phase 28a.3)', () => {
    it('accepts a minimal valid payload', () => {
      const result = InitiativeSyncSchema.safeParse({
        entries: [{ entityName: 'Bob', entityType: 'pc', isActive: true }],
        currentIndex: 0,
        round: 1
      })
      expect(result.success).toBe(true)
    })

    it('rejects entries missing entityType', () => {
      const result = InitiativeSyncSchema.safeParse({
        entries: [{ entityName: 'Bob', isActive: true }],
        currentIndex: 0,
        round: 1
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative currentIndex', () => {
      const result = InitiativeSyncSchema.safeParse({
        entries: [],
        currentIndex: -1,
        round: 1
      })
      expect(result.success).toBe(false)
    })
  })
})
