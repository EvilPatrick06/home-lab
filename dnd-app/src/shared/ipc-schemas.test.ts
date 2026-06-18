import { describe, expect, it } from 'vitest'
import {
  ActiveCreatureSchema,
  AdvanceChapterSchema,
  AiChatRequestSchema,
  AiConfigSchema,
  ConversationDataSchema,
  InitiativeSyncSchema,
  OracleFateCheckSchema,
  OracleSetChaosSchema,
  QuestObjectiveUpdateSchema,
  SceneLabelSchema,
  SeedQuestsRequestSchema,
  SyncEventSchema
} from './ipc-schemas'

describe('ipc-schemas', () => {
  // PHASE-26 26D
  describe('SceneLabelSchema', () => {
    it('trims and accepts a normal label', () => {
      const r = SceneLabelSchema.safeParse('  The Crypt  ')
      expect(r.success && r.data).toBe('The Crypt')
    })
    it('rejects empty / whitespace-only', () => {
      expect(SceneLabelSchema.safeParse('').success).toBe(false)
      expect(SceneLabelSchema.safeParse('   ').success).toBe(false)
    })
    it('rejects oversize (>120 chars)', () => {
      expect(SceneLabelSchema.safeParse('x'.repeat(121)).success).toBe(false)
    })
  })

  describe('ConversationDataSchema tiered summaries (PHASE-26)', () => {
    it('preserves tier/label/createdAt on a summary (does not strip)', () => {
      const r = ConversationDataSchema.safeParse({
        messages: [],
        summaries: [
          { content: 'recap', coversUpTo: -1, tier: 'scene', label: 'The Crypt', createdAt: '2026-01-01T00:00:00Z' }
        ],
        activeCharacterIds: []
      })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.summaries[0].tier).toBe('scene')
        expect(r.data.summaries[0].label).toBe('The Crypt')
        expect(r.data.summaries[0].createdAt).toBe('2026-01-01T00:00:00Z')
      }
    })
    it('still accepts legacy untiered summaries', () => {
      const r = ConversationDataSchema.safeParse({
        messages: [],
        summaries: [{ content: 'old', coversUpTo: -1 }],
        activeCharacterIds: []
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.summaries[0].tier).toBeUndefined()
    })
  })
  describe('AiConfigSchema', () => {
    it('should accept valid config with provider and model', () => {
      const result = AiConfigSchema.safeParse({
        provider: 'ollama',
        model: 'llama3',
        ollamaUrl: 'http://localhost:11434'
      })
      expect(result.success).toBe(true)
    })

    // PHASE-29 — routing + local-endpoint flavor parse/strip
    it('parses the routing block and a llamacpp flavor', () => {
      const result = AiConfigSchema.safeParse({
        provider: 'ollama',
        model: 'llama3',
        routing: { enabled: true, smallModel: 'llama3.2:1b' },
        localEndpointFlavor: 'llamacpp'
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.routing).toEqual({ enabled: true, smallModel: 'llama3.2:1b' })
        expect(result.data.localEndpointFlavor).toBe('llamacpp')
      }
    })

    it('rejects an invalid localEndpointFlavor and strips unknown keys', () => {
      expect(AiConfigSchema.safeParse({ provider: 'ollama', model: 'm', localEndpointFlavor: 'vllm' }).success).toBe(
        false
      )
      const result = AiConfigSchema.safeParse({ provider: 'ollama', model: 'm', bogusKey: 'x' })
      expect(result.success).toBe(true)
      if (result.success) expect('bogusKey' in result.data).toBe(false)
    })

    it('should accept config with cloud provider', () => {
      const result = AiConfigSchema.safeParse({
        provider: 'claude',
        model: 'claude-3-5-sonnet-20241022',
        claudeApiKey: 'sk-ant-test'
      })
      expect(result.success).toBe(true)
    })

    // PHASE-43 (CodeQL SSRF hardening): ollamaUrl must be http(s) — any host is fine
    // (remote Ollama servers), but file:/gopher:/data: schemes are rejected.
    it('accepts http(s) ollamaUrl hosts (incl. remote) but rejects non-http schemes', () => {
      for (const url of ['http://localhost:11434', 'https://gpu.example.com:11434', 'http://192.168.1.50:11434']) {
        expect(AiConfigSchema.safeParse({ provider: 'ollama', model: 'm', ollamaUrl: url }).success).toBe(true)
      }
      for (const bad of ['file:///etc/passwd', 'gopher://internal:70/', 'data:text/plain,x', 'ftp://host/f']) {
        expect(AiConfigSchema.safeParse({ provider: 'ollama', model: 'm', ollamaUrl: bad }).success).toBe(false)
      }
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

    it('round-trips actingCharacterId (PHASE-11 11F)', () => {
      const result = AiChatRequestSchema.safeParse({
        campaignId: 'id',
        message: 'Hi',
        characterIds: ['c1'],
        actingCharacterId: 'c1'
      })
      expect(result.success).toBe(true)
      expect(result.success && result.data.actingCharacterId).toBe('c1')
    })

    it('still strips genuinely unknown keys', () => {
      const result = AiChatRequestSchema.safeParse({
        campaignId: 'id',
        message: 'Hi',
        characterIds: ['c1'],
        bogusField: 'nope'
      })
      expect(result.success).toBe(true)
      expect(result.success && 'bogusField' in result.data).toBe(false)
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

  // PHASE-28 28B — quest objective + chapter advancement wire schemas
  describe('QuestObjectiveUpdateSchema', () => {
    it('accepts a valid objective update', () => {
      const r = QuestObjectiveUpdateSchema.safeParse({ questName: 'Main', operation: 'complete', objective: 'o1' })
      expect(r.success).toBe(true)
    })
    it('rejects an unknown operation', () => {
      const r = QuestObjectiveUpdateSchema.safeParse({ questName: 'Main', operation: 'finish', objective: 'o1' })
      expect(r.success).toBe(false)
    })
    it('rejects an empty quest name / objective', () => {
      expect(QuestObjectiveUpdateSchema.safeParse({ questName: '', operation: 'add', objective: 'x' }).success).toBe(
        false
      )
      expect(QuestObjectiveUpdateSchema.safeParse({ questName: 'Q', operation: 'add', objective: '' }).success).toBe(
        false
      )
    })
  })

  describe('AdvanceChapterSchema', () => {
    it('accepts an empty payload (all fields optional)', () => {
      expect(AdvanceChapterSchema.safeParse({}).success).toBe(true)
    })
    it('accepts title/goal/reason', () => {
      expect(AdvanceChapterSchema.safeParse({ title: 'Ch 2', goal: 'find it', reason: 'done' }).success).toBe(true)
    })
    it('rejects an over-long title', () => {
      expect(AdvanceChapterSchema.safeParse({ title: 'x'.repeat(200) }).success).toBe(false)
    })
  })

  // PHASE-28 28D — dice-oracle wire schemas
  describe('OracleFateCheckSchema', () => {
    it('accepts a question + valid likelihood', () => {
      expect(OracleFateCheckSchema.safeParse({ question: 'Is it guarded?', likelihood: 'even' }).success).toBe(true)
    })
    it('rejects an unknown likelihood / empty question', () => {
      expect(OracleFateCheckSchema.safeParse({ question: 'q', likelihood: 'maybe' }).success).toBe(false)
      expect(OracleFateCheckSchema.safeParse({ question: '', likelihood: 'even' }).success).toBe(false)
    })
  })

  describe('OracleSetChaosSchema', () => {
    it('accepts value or delta', () => {
      expect(OracleSetChaosSchema.safeParse({ value: 7 }).success).toBe(true)
      expect(OracleSetChaosSchema.safeParse({ delta: -1 }).success).toBe(true)
    })
    it('rejects an empty payload', () => {
      expect(OracleSetChaosSchema.safeParse({}).success).toBe(false)
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

    // ── PHASE-22 22D: new union member + Pi-shaped payloads (locks the 22A contract) ──
    it('accepts the main-internal bmo_unreachable event', () => {
      const result = SyncEventSchema.safeParse({ type: 'bmo_unreachable', timestamp: 1, payload: {} })
      expect(result.success).toBe(true)
    })

    it('accepts the Pi 22A discord_message payload ({text, author, characterName})', () => {
      const result = SyncEventSchema.safeParse({
        type: 'discord_message',
        timestamp: 1,
        payload: { text: 'I attack', author: 'alice', characterName: 'Aria' }
      })
      expect(result.success).toBe(true)
    })

    it('accepts the Pi 22A discord_roll payload ({formula, total, rolls, rollerName, characterName})', () => {
      const result = SyncEventSchema.safeParse({
        type: 'discord_roll',
        timestamp: 1,
        payload: { formula: '1d20+5', total: 17, rolls: [12], rollerName: 'bob', characterName: 'Borin' }
      })
      expect(result.success).toBe(true)
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

  // PHASE-37 37D — seed-quests request
  describe('SeedQuestsRequestSchema', () => {
    it('parses a valid payload and applies defaults', () => {
      const r = SeedQuestsRequestSchema.safeParse({ campaignId: 'c1', quests: [{ name: 'Q' }] })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.quests[0].description).toBe('')
        expect(r.data.quests[0].objectives).toEqual([])
        expect(r.data.quests[0].chapterQuest).toBe(false)
      }
    })
    it('rejects an empty quests array', () => {
      expect(SeedQuestsRequestSchema.safeParse({ campaignId: 'c1', quests: [] }).success).toBe(false)
    })
    it('rejects a quest with no name', () => {
      expect(SeedQuestsRequestSchema.safeParse({ campaignId: 'c1', quests: [{ description: 'x' }] }).success).toBe(
        false
      )
    })
    it('rejects more than 25 quests', () => {
      const quests = Array.from({ length: 26 }, (_, i) => ({ name: `Q${i}` }))
      expect(SeedQuestsRequestSchema.safeParse({ campaignId: 'c1', quests }).success).toBe(false)
    })
  })
})
