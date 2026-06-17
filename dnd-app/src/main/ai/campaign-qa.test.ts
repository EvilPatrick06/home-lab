import { beforeEach, describe, expect, it, vi } from 'vitest'

const { aiChatOnceMock, addMessageSpy, convMock } = vi.hoisted(() => {
  const addMessageSpy = vi.fn()
  return {
    aiChatOnceMock: vi.fn(async () => 'The duke lives in the keep, per the JOURNAL.'),
    addMessageSpy,
    convMock: {
      serialize: () => ({ summaries: [], messages: [], activeCharacterIds: [] }),
      getMessages: () => [],
      addMessage: addMessageSpy
    }
  }
})

vi.mock('./ai-service', () => ({ aiChatOnce: aiChatOnceMock, getConversationManager: () => convMock }))
vi.mock('./campaign-context', () => ({
  loadCampaignById: vi.fn(async () => ({ journal: { entries: [{ title: 'S1', content: 'The party met the duke' }] } })),
  formatCampaignForContext: () => '[CAMPAIGN DATA]\nThe Duke of Neverwinter\n[/CAMPAIGN DATA]'
}))
vi.mock('./memory-manager', () => ({
  getMemoryManager: () => ({ assembleContext: vi.fn(async () => '[NPCS]\nDuke') })
}))
vi.mock('./entity-store', () => ({
  getEntityStore: () => ({ buildEntityContextBlock: vi.fn(async () => '[ENTITY RECORDS]\nDuke') })
}))
vi.mock('../storage/ai-conversation-storage', () => ({
  loadConversation: vi.fn(async () => ({ success: true, data: null }))
}))

import { askCampaignQuestion, buildQaPrompt, QA_REFUSAL } from './campaign-qa'

beforeEach(() => vi.clearAllMocks())

describe('buildQaPrompt (PHASE-31 31C)', () => {
  it('labels every supplied block and embeds the exact refusal sentence + grounding restatement', () => {
    const { system, user } = buildQaPrompt(
      [
        { label: 'CAMPAIGN', content: 'duke data' },
        { label: 'JOURNAL', content: 'session one' }
      ],
      'Who is the duke?'
    )
    expect(system).toContain(QA_REFUSAL)
    expect(system).toMatch(/ONLY the labeled campaign records/i)
    expect(user).toContain('[CAMPAIGN]')
    expect(user).toContain('[JOURNAL]')
    expect(user).toContain('[QUESTION]')
    expect(user).toContain('Who is the duke?')
    // Grounding constraint restated at the END of the user message (instruction reinforcement).
    expect(user.trimEnd().endsWith(`"${QA_REFUSAL}"`)).toBe(true)
  })

  it('drops empty blocks', () => {
    const { user } = buildQaPrompt(
      [
        { label: 'CAMPAIGN', content: 'x' },
        { label: 'JOURNAL', content: '   ' }
      ],
      'q'
    )
    expect(user).toContain('[CAMPAIGN]')
    expect(user).not.toContain('[JOURNAL]')
  })
})

describe('askCampaignQuestion (PHASE-31 31C)', () => {
  it('returns the answer + timestamp and NEVER mutates the conversation history', async () => {
    const res = await askCampaignQuestion('11111111-1111-1111-1111-111111111111', 'Who is the duke?')
    expect(res.answer).toContain('JOURNAL')
    expect(typeof res.askedAt).toBe('string')
    expect(aiChatOnceMock).toHaveBeenCalledTimes(1)
    // The mechanics task class is used (PHASE-29 routing).
    expect(aiChatOnceMock).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'mechanics')
    // The in-fiction conversation is provably untouched.
    expect(addMessageSpy).not.toHaveBeenCalled()
  })

  it('falls back to the refusal sentence when the model returns nothing', async () => {
    aiChatOnceMock.mockResolvedValueOnce('   ')
    const res = await askCampaignQuestion('11111111-1111-1111-1111-111111111111', 'unknown?')
    expect(res.answer).toBe(QA_REFUSAL)
  })
})
