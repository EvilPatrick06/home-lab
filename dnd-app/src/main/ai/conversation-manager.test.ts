import { describe, expect, it, vi } from 'vitest'

vi.mock('./dm-system-prompt', () => ({
  DM_TOOLBOX_CONTEXT: '\n\nToolbox context.',
  PLANAR_RULES_CONTEXT: '\n\nPlanar context.'
}))

vi.mock('./prompt-sections/combat-tactics', () => ({
  COMBAT_TACTICS_PROMPT: '\n\nCombat tactics.'
}))
vi.mock('./prompt-sections/narrative-rules', () => ({
  NARRATIVE_RULES_PROMPT: 'Base system prompt.'
}))

let mockWindow = 100_000
vi.mock('./token-budget', () => ({
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  trimToTokenBudget: vi.fn((text: string) => text),
  OUTPUT_RESERVE: 2000,
  getActiveContextWindow: vi.fn(() => mockWindow),
  getEffectiveBudgets: vi.fn(() => ({
    retrievedChunks: 2000,
    srdData: 2000,
    campaignData: 1000,
    creatures: 500,
    gameState: 500,
    memory: 500,
    conversationHistory: 2000
  })),
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

    it('restores conversation in new (post-prune) format unchanged', () => {
      // New-format data: latest summary's coversUpTo === -1 (summary precedes
      // all current messages). No migration needed.
      const mgr = new ConversationManager()
      mgr.restore({
        messages: [
          { role: 'user', content: 'Hi', timestamp: '2024-01-01T00:00:00.000Z' },
          { role: 'assistant', content: 'Hello!', timestamp: '2024-01-01T00:00:01.000Z' }
        ],
        summaries: [{ content: 'Summary of events', coversUpTo: -1 }],
        activeCharacterIds: ['char-a']
      })

      expect(mgr.getMessageCount()).toBe(2)
      expect(mgr.getActiveCharacterIds()).toEqual(['char-a'])
    })

    it('migrates legacy (pre-prune) format on restore — splices the summarized prefix', () => {
      // Legacy data carries the full unpruned message array plus an absolute
      // coversUpTo index. Restore should drop the now-summarized prefix so the
      // post-prune invariant holds.
      const mgr = new ConversationManager()
      mgr.restore({
        messages: [
          { role: 'user', content: 'Old1', timestamp: '2024-01-01T00:00:00.000Z' },
          { role: 'assistant', content: 'Old2', timestamp: '2024-01-01T00:00:01.000Z' },
          { role: 'user', content: 'Fresh1', timestamp: '2024-01-01T00:00:02.000Z' }
        ],
        summaries: [{ content: 'Summary of events', coversUpTo: 1 }],
        activeCharacterIds: ['char-a']
      })

      // After migration: the 2 summarized msgs are gone, only 'Fresh1' remains
      expect(mgr.getMessageCount()).toBe(1)
      expect(mgr.getActiveCharacterIds()).toEqual(['char-a'])
    })

    it('handles restore with missing fields gracefully', () => {
      const mgr = new ConversationManager()
      mgr.restore({} as any)

      expect(mgr.getMessageCount()).toBe(0)
      expect(mgr.getActiveCharacterIds()).toEqual([])
    })

    it('prunes messages array after summarize (caps growth)', async () => {
      const mgr = new ConversationManager()
      mgr.setSummarizeCallback(async (text) => `sum(${text.length})`)

      // Push enough messages to trigger summarize (MAX_RECENT_MESSAGES = 10)
      for (let i = 0; i < 12; i++) {
        mgr.addMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`)
      }
      expect(mgr.getMessageCount()).toBe(12)

      // getMessagesForApi calls maybeSummarize; assert prune happened
      await mgr.getMessagesForApi('')
      expect(mgr.getMessageCount()).toBe(6) // halfPoint was floor(12/2) = 6
      const data = mgr.serialize()
      expect(data.summaries).toHaveLength(1)
      expect(data.summaries[0].coversUpTo).toBe(-1)
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

    it('flags contextTruncated when the estimate exceeds the active window (PHASE-01 01C)', async () => {
      mockWindow = 4096 // tiny Ollama default window
      const mgr = new ConversationManager()
      // A system prompt well over the window with no section trims still flags truncated.
      const huge = 'x'.repeat(4096 * 4 + 8000)
      await mgr.getMessagesForApi(huge)
      expect(mgr.contextWasTruncated).toBe(true)
      mockWindow = 100_000
    })

    it('does not flag contextTruncated for a small prompt within a large window', async () => {
      mockWindow = 100_000
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'hi')
      await mgr.getMessagesForApi('small system prompt')
      expect(mgr.contextWasTruncated).toBe(false)
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

  // 06A — scene-prep cleanup helpers used by cancelScenePrep / prepareScene retry.
  const PROMPT = 'The adventure begins. Set the scene for the party.'
  describe('removeTrailingUserMessage', () => {
    it('removes an exact trailing user match', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', PROMPT)
      expect(mgr.removeTrailingUserMessage(PROMPT)).toBe(true)
      expect(mgr.getMessageCount()).toBe(0)
    })

    it('does not remove when the trailing message is an assistant', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', PROMPT)
      mgr.addMessage('assistant', 'A scene')
      expect(mgr.removeTrailingUserMessage(PROMPT)).toBe(false)
      expect(mgr.getMessageCount()).toBe(2)
    })

    it('does not remove when the content differs', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'something else')
      expect(mgr.removeTrailingUserMessage(PROMPT)).toBe(false)
      expect(mgr.getMessageCount()).toBe(1)
    })

    it('returns false on an empty conversation', () => {
      expect(new ConversationManager().removeTrailingUserMessage(PROMPT)).toBe(false)
    })
  })

  describe('clearScenePrepExchange', () => {
    it('clears a lone prep prompt', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', PROMPT)
      expect(mgr.clearScenePrepExchange(PROMPT)).toBe(true)
      expect(mgr.getMessageCount()).toBe(0)
    })

    it('clears a [prompt, assistant] exchange', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', PROMPT)
      mgr.addMessage('assistant', 'A scene')
      expect(mgr.clearScenePrepExchange(PROMPT)).toBe(true)
      expect(mgr.getMessageCount()).toBe(0)
    })

    it('refuses a 3-message conversation (real history)', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', PROMPT)
      mgr.addMessage('assistant', 'A scene')
      mgr.addMessage('user', 'I attack')
      expect(mgr.clearScenePrepExchange(PROMPT)).toBe(false)
      expect(mgr.getMessageCount()).toBe(3)
    })

    it('refuses when the first message is not the prep prompt', () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'a different opener')
      expect(mgr.clearScenePrepExchange(PROMPT)).toBe(false)
      expect(mgr.getMessageCount()).toBe(1)
    })
  })

  // 07B — contextWasTruncated must flip exactly when history messages were dropped (the old
  // `tokenCount >= budget` check was a false negative) or the caller reports a context trim.
  describe('contextWasTruncated (07B / F3)', () => {
    // estimateTokens mock = len/4; getEffectiveBudgets().conversationHistory = 2000 (mock above).
    const bigMsg = 'x'.repeat(4000) // ~1000 tokens each

    it('flips true when history messages are dropped (regression for the false negative)', async () => {
      const mgr = new ConversationManager()
      for (let i = 0; i < 6; i++) mgr.addMessage(i % 2 === 0 ? 'user' : 'assistant', bigMsg) // ~6000 tokens > 2000
      await mgr.getMessagesForApi('')
      expect(mgr.contextWasTruncated).toBe(true)
    })

    it('stays false when all messages fit the history budget', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'hi')
      mgr.addMessage('assistant', 'hello')
      await mgr.getMessagesForApi('')
      expect(mgr.contextWasTruncated).toBe(false)
    })

    it('flips true when the caller reports a context-section trim', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', 'hi')
      await mgr.getMessagesForApi('ctx', true)
      expect(mgr.contextWasTruncated).toBe(true)
    })

    it('stays false for a single oversized message (admitted unconditionally, nothing dropped)', async () => {
      const mgr = new ConversationManager()
      mgr.addMessage('user', bigMsg.repeat(3)) // one message far over budget
      await mgr.getMessagesForApi('')
      expect(mgr.contextWasTruncated).toBe(false)
    })
  })

  // ── PHASE-26: scene-boundary layered memory ──
  describe('scene mode (PHASE-26)', () => {
    const sceneMgr = (cb: (t: string) => Promise<string>) => {
      const mgr = new ConversationManager()
      mgr.setSummarizeCallback(cb)
      mgr.setSummarizationMode('scene')
      return mgr
    }
    const fill = (mgr: ConversationManager, n: number, prefix = 'm') => {
      for (let i = 0; i < n; i++) mgr.addMessage(i % 2 === 0 ? 'user' : 'assistant', `${prefix}${i}`)
    }

    it('tier/label/createdAt round-trip through serialize/restore', () => {
      const mgr = new ConversationManager()
      mgr.restore({
        messages: [],
        summaries: [
          { content: 'c', coversUpTo: -1, tier: 'scene', label: 'The Crypt', createdAt: '2026-01-01T00:00:00Z' }
        ],
        activeCharacterIds: []
      })
      const s = mgr.serialize().summaries[0]
      expect(s.tier).toBe('scene')
      expect(s.label).toBe('The Crypt')
      expect(s.createdAt).toBe('2026-01-01T00:00:00Z')
    })

    it('endScene prunes to the carryover, pushes a scene-tier summary with label', async () => {
      const cb = vi.fn(async () => 'SCENE SUMMARY')
      const mgr = sceneMgr(cb)
      fill(mgr, 12)
      const res = await mgr.endScene('The Crypt')
      expect(res.summarized).toBe(true)
      expect(cb).toHaveBeenCalledTimes(1)
      expect(mgr.getMessageCount()).toBe(4) // SCENE_CARRYOVER_MESSAGES
      const counts = mgr.getSummaryTierCounts()
      expect(counts.scene).toBe(1)
      const s = mgr.serialize().summaries[0]
      expect(s.label).toBe('The Crypt')
      expect(s.createdAt).toBeDefined()
      expect(s.coversUpTo).toBe(-1)
    })

    it('endScene is a no-op (no LLM call) for a short scene', async () => {
      const cb = vi.fn(async () => 'X')
      const mgr = sceneMgr(cb)
      fill(mgr, 8) // cut = 8-4 = 4 < SCENE_SUMMARY_MIN_MESSAGES (6)
      const res = await mgr.endScene()
      expect(res.summarized).toBe(false)
      expect(cb).not.toHaveBeenCalled()
      expect(mgr.getMessageCount()).toBe(8) // untouched
    })

    it('endScene leaves messages intact when the callback throws', async () => {
      const cb = vi.fn(async () => {
        throw new Error('boom')
      })
      const mgr = sceneMgr(cb)
      fill(mgr, 12)
      const res = await mgr.endScene()
      expect(res.summarized).toBe(false)
      expect(mgr.getMessageCount()).toBe(12) // unchanged
    })

    it('a message appended DURING the awaited summarize survives the prune', async () => {
      let resolveCb: (s: string) => void = () => {}
      const cb = vi.fn(() => new Promise<string>((r) => (resolveCb = r)))
      const mgr = sceneMgr(cb)
      fill(mgr, 12)
      const p = mgr.endScene()
      mgr.addMessage('user', 'LATE MESSAGE') // arrives mid-await, index ≥ cut
      resolveCb('SUMMARY')
      await p
      const tail = mgr.getMessages().map((m) => m.content)
      expect(tail).toContain('LATE MESSAGE')
    })

    it('scene→session roll-up at the threshold keeps the newest SCENE_ROLLUP_KEEP', async () => {
      const cb = vi.fn(async () => 'ROLLED')
      const mgr = sceneMgr(cb)
      const scenes = Array.from({ length: 8 }, (_, i) => ({
        content: `scene ${i}`,
        coversUpTo: -1,
        tier: 'scene' as const
      }))
      mgr.restore({ messages: [], summaries: scenes, activeCharacterIds: [] })
      fill(mgr, 12) // enough to summarize the 9th scene
      await mgr.endScene() // 9th scene → 9 > SCENE_ROLLUP_THRESHOLD (8) → roll up
      const counts = mgr.getSummaryTierCounts()
      expect(counts.session).toBe(1)
      expect(counts.scene).toBe(4) // SCENE_ROLLUP_KEEP
    })

    it('session→campaign roll-up merges sessions when over the threshold', async () => {
      const cb = vi.fn(async () => 'MERGED')
      const mgr = sceneMgr(cb)
      const sessions = Array.from({ length: 5 }, (_, i) => ({
        content: `session ${i}`,
        coversUpTo: -1,
        tier: 'session' as const
      }))
      mgr.restore({ messages: [], summaries: sessions, activeCharacterIds: [] })
      fill(mgr, 12)
      await mgr.endScene() // new scene → maybeRollUp: 5 sessions > 4 → campaign roll-up
      const counts = mgr.getSummaryTierCounts()
      expect(counts.campaign).toBe(1)
      expect(counts.session).toBe(0)
    })

    it('getMessagesForApi injects a layered [CAMPAIGN MEMORY] block in tier order', async () => {
      const mgr = new ConversationManager()
      mgr.setSummarizationMode('scene')
      mgr.restore({
        messages: [],
        summaries: [
          { content: 'the realm endures', coversUpTo: -1, tier: 'campaign' },
          { content: 'last session recap', coversUpTo: -1, tier: 'session' },
          { content: 'fought goblins', coversUpTo: -1, tier: 'scene', label: 'The Crypt' }
        ],
        activeCharacterIds: []
      })
      mgr.addMessage('user', 'What now?')
      const { messages } = await mgr.getMessagesForApi('')
      const injected = messages[0].content
      expect(injected).toContain('[CAMPAIGN MEMORY]')
      expect(injected).toContain('Campaign so far: the realm endures')
      expect(injected).toContain('Recent sessions: last session recap')
      expect(injected).toContain('Earlier this session: (The Crypt) fought goblins')
      expect(injected).toContain('[/CAMPAIGN MEMORY]')
      expect(injected).toContain('What now?')
    })

    it('scene mode skips maybeSummarize (no inline summarize call on the request path)', async () => {
      const cb = vi.fn(async () => 'X')
      const mgr = sceneMgr(cb)
      fill(mgr, 20) // far over MAX_RECENT_MESSAGES — would summarize in threshold mode
      await mgr.getMessagesForApi('')
      expect(cb).not.toHaveBeenCalled()
    })

    it('overflowSplitNeeded flips when the budget loop drops messages', async () => {
      const mgr = new ConversationManager()
      mgr.setSummarizationMode('scene')
      const big = 'x'.repeat(4000) // ~1000 tokens each; budget is 2000
      mgr.addMessage('user', big)
      mgr.addMessage('assistant', big)
      mgr.addMessage('user', big) // 3 × 1000 > 2000 → at least one dropped
      await mgr.getMessagesForApi('')
      expect(mgr.overflowSplitNeeded).toBe(true)
    })
  })
})
