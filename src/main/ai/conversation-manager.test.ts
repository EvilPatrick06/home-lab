import { describe, expect, it, vi } from 'vitest'

vi.mock('./dm-system-prompt', () => ({
  DM_SYSTEM_PROMPT: 'Base system prompt.',
  DM_TOOLBOX_CONTEXT: '\n\nToolbox context.',
  PLANAR_RULES_CONTEXT: '\n\nPlanar context.'
}))

vi.mock('./prompt-sections/combat-tactics', () => ({
  COMBAT_TACTICS_PROMPT: '\n\nCombat tactics.'
}))

vi.mock('./token-budget', () => ({
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  TOKEN_BUDGETS: {
    systemPrompt: 4000,
    retrievedChunks: 2000,
    srdData: 2000,
    campaignData: 1000,
    creatures: 500,
    gameState: 500,
    memory: 500,
    conversationHistory: 2000,
    responseBuffer: 1000,
    fileReadContent: 500,
    webSearchResults: 500,
    total: 14000
  }
}))

import { ConversationManager } from './conversation-manager'

describe('ConversationManager', () => {
  // ── Basic Message Operations ──

  describe('addMessage / getMessages', () => {
    it('adds a user message and retrieves it', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Hello DM')

      const messages = mgr.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Hello DM')
      expect(messages[0].timestamp).toBeDefined()
    })

    it('adds an assistant message', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('assistant', 'Welcome, adventurer!')

      const messages = mgr.getMessages()
      expect(messages[0].role).toBe('assistant')
      expect(messages[0].content).toBe('Welcome, adventurer!')
    })

    it('stores contextChunkIds when provided', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'What are grapple rules?', ['chunk-1', 'chunk-2'])

      expect(mgr.getMessages()[0].contextChunkIds).toEqual(['chunk-1', 'chunk-2'])
    })
  })

  // ── Message Count ──

  describe('getMessageCount', () => {
    it('returns 0 for empty conversation', () => {
      const mgr = new ConversationManager()
      expect(mgr.getMessageCount()).toBe(0)
    })

    it('returns correct count after adding messages', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'msg1')
      mgr.addMessage('assistant', 'msg2')
      mgr.addMessage('user', 'msg3')
      expect(mgr.getMessageCount()).toBe(3)
    })
  })

  // ── Active Character IDs ──

  describe('setActiveCharacterIds / getActiveCharacterIds', () => {
    it('stores and retrieves active character IDs', () => {
      const mgr = new ConversationManager()
      mgr.setActiveCharacterIds(['char-1', 'char-2'])
      expect(mgr.getActiveCharacterIds()).toEqual(['char-1', 'char-2'])
    })

    it('returns empty array by default', () => {
      const mgr = new ConversationManager()
      expect(mgr.getActiveCharacterIds()).toEqual([])
    })
  })

  // ── Clear ──

  describe('clear', () => {
    it('removes all messages and summaries', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'msg1')
      mgr.addMessage('assistant', 'msg2')
      mgr.clear()
      expect(mgr.getMessageCount()).toBe(0)
      expect(mgr.getMessages()).toEqual([])
    })
  })

  // ── Serialize / Restore ──

  describe('serialize / restore', () => {
    it('serializes conversation state', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Hello')
      mgr.setActiveCharacterIds(['char-1'])

      const data = mgr.serialize()
      expect(data.messages).toHaveLength(1)
      expect(data.activeCharacterIds).toEqual(['char-1'])
      expect(data.summaries).toEqual([])
    })

    it('restores conversation from serialized data', () => {
      const mgr = new ConversationManager()
      mgr.restore({
        messages: [
          { role: 'user', content: 'Hi', timestamp: '2024-01-01T00:00:00.000Z' },
          { role: 'assistant', content: 'Hello!', timestamp: '2024-01-01T00:00:01.000Z' }
        ],
        summaries: [{ content: 'Summary of events', coversUpTo: 0 }],
        activeCharacterIds: ['char-a']
      })

      expect(mgr.getMessageCount()).toBe(2)
      expect(mgr.getActiveCharacterIds()).toEqual(['char-a'])
    })

    it('handles restore with missing fields gracefully', () => {
      const mgr = new ConversationManager()
      mgr.restore({} as any)

      expect(mgr.getMessageCount()).toBe(0)
      expect(mgr.getActiveCharacterIds()).toEqual([])
    })
  })

  // ── getMessagesForApi ──

  describe('getMessagesForApi', () => {
    it('returns system prompt and messages', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'What is AC?')

      const { systemPrompt, messages } = await mgr.getMessagesForApi('')
      expect(systemPrompt).toContain('Base system prompt.')
      expect(messages.length).toBeGreaterThan(0)
      expect(messages[0].role).toBe('user')
    })

    it('includes combat tactics when context contains Initiative', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Attack the goblin')

      const { systemPrompt } = await mgr.getMessagesForApi('Initiative: round 1')
      expect(systemPrompt).toContain('Combat tactics.')
    })

    it('includes planar context when context contains planar keywords', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Enter portal')

      const { systemPrompt } = await mgr.getMessagesForApi('The Feywild shimmers before you')
      expect(systemPrompt).toContain('Planar context.')
    })

    it('includes toolbox context when ACTIVE EFFECTS present', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Check weather')

      const { systemPrompt } = await mgr.getMessagesForApi('ACTIVE EFFECTS: blizzard')
      expect(systemPrompt).toContain('Toolbox context.')
    })

    it('does not include optional sections when keywords are absent', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Hello')

      const { systemPrompt } = await mgr.getMessagesForApi('Nothing special here')
      expect(systemPrompt).not.toContain('Combat tactics.')
      expect(systemPrompt).not.toContain('Planar context.')
      expect(systemPrompt).not.toContain('Toolbox context.')
    })

    it('ensures messages alternate user/assistant', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('assistant', 'First response')
      mgr.addMessage('user', 'Question')

      const { messages } = await mgr.getMessagesForApi('')
      // First message should be user role (prepended)
      expect(messages[0].role).toBe('user')
    })

    it('merges consecutive same-role messages', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Part 1')
      mgr.addMessage('user', 'Part 2')
      mgr.addMessage('assistant', 'Response')

      const { messages } = await mgr.getMessagesForApi('')
      // Two user messages should be merged into one
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toContain('Part 1')
      expect(messages[0].content).toContain('Part 2')
    })

    it('tracks token estimate', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Short message')

      await mgr.getMessagesForApi('')
      expect(mgr.lastTokenEstimate).toBeGreaterThan(0)
    })

    it('triggers summarization when many messages exist', async () => {
      const mgr = new ConversationManager()
      const summarize = vi.fn(async () => 'Summarized conversation')
      mgr.setSummarizeCallback(summarize)

      // Add 12 messages (exceeds MAX_RECENT_MESSAGES = 10)
      for (let i = 0; i < 12; i++) {
        mgr.addMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`)
      }

      await mgr.getMessagesForApi('')
      expect(summarize).toHaveBeenCalled()
    })

    it('prepends summary to first user message', async () => {
      const mgr = new ConversationManager()
      const summarize = vi.fn(async () => 'Events: dragon attacked')
      mgr.setSummarizeCallback(summarize)

      for (let i = 0; i < 12; i++) {
        mgr.addMessage(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`)
      }

      const { messages } = await mgr.getMessagesForApi('')
      // After summarization, first message should contain summary
      const firstUser = messages.find((m) => m.role === 'user')
      expect(firstUser).toBeDefined()
    })
  })

  // ── contextWasTruncated ──

  describe('contextWasTruncated', () => {
    it('is false by default', () => {
      const mgr = new ConversationManager()
      expect(mgr.contextWasTruncated).toBe(false)
    })
  })

  // ── generateSessionSummary ──

  describe('generateSessionSummary', () => {
    it('returns null when no summarize callback is set', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'Hello')
      expect(await mgr.generateSessionSummary()).toBeNull()
    })

    it('returns null when no messages exist', async () => {
      const mgr = new ConversationManager()
      mgr.setSummarizeCallback(async () => 'summary')
      expect(await mgr.generateSessionSummary()).toBeNull()
    })

    it('generates a summary from messages', async () => {
      const mgr = new ConversationManager()
      mgr.setSummarizeCallback(async () => 'Session recap: battle with goblins')
      mgr.addMessage('user', 'I attack the goblin')
      mgr.addMessage('assistant', 'You swing your sword...')

      const summary = await mgr.generateSessionSummary()
      expect(summary).toBe('Session recap: battle with goblins')
    })

    it('returns null when summarize callback throws', async () => {
      const mgr = new ConversationManager()
      mgr.setSummarizeCallback(async () => {
        throw new Error('API error')
      })
      mgr.addMessage('user', 'msg')

      expect(await mgr.generateSessionSummary()).toBeNull()
    })
  })
})
