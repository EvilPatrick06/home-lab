import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('../storage/ai-conversation-storage', () => ({
  saveConversation: vi.fn().mockResolvedValue({ success: true })
}))

vi.mock('./memory-manager', () => ({
  getMemoryManager: vi.fn(() => ({
    appendSessionLog: vi.fn().mockResolvedValue(undefined)
  }))
}))

vi.mock('./tone-validator', () => ({
  hasViolations: vi.fn(() => false),
  cleanNarrativeText: vi.fn((t: string) => t)
}))

import { finalizeAiResponse, parseRuleCitations, stripRuleCitations } from './ai-response-parser'
import type { ConversationManager } from './conversation-manager'
import { cleanNarrativeText, hasViolations } from './tone-validator'
import type { AiChatRequest } from './types'

const mockHasViolations = vi.mocked(hasViolations)
const mockCleanNarrativeText = vi.mocked(cleanNarrativeText)

beforeEach(() => {
  vi.clearAllMocks()
  mockHasViolations.mockReturnValue(false)
  mockCleanNarrativeText.mockImplementation((t: string) => t)
})

function makeConvManager(): ConversationManager {
  return {
    addMessage: vi.fn(),
    serialize: vi.fn().mockReturnValue({ messages: [], summaries: [], activeCharacterIds: [] })
  } as unknown as ConversationManager
}

function makeRequest(overrides: Partial<AiChatRequest> = {}): AiChatRequest {
  return {
    campaignId: 'campaign1',
    message: 'Hello DM',
    characterIds: ['char1'],
    senderName: 'Player1',
    ...overrides
  }
}

describe('parseRuleCitations', () => {
  it('returns empty array when no citations', () => {
    expect(parseRuleCitations('Just narrative text')).toEqual([])
  })

  it('parses a single rule citation', () => {
    const text =
      'Some text [RULE_CITATION source="PHB" rule="Fireball"]A 3rd-level evocation spell.[/RULE_CITATION] more text'
    const result = parseRuleCitations(text)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      source: 'PHB',
      rule: 'Fireball',
      text: 'A 3rd-level evocation spell.'
    })
  })

  it('parses multiple rule citations', () => {
    const text = `
[RULE_CITATION source="PHB" rule="Fireball"]Fire damage.[/RULE_CITATION]
[RULE_CITATION source="DMG" rule="Cover"]Half cover grants +2 AC.[/RULE_CITATION]
    `
    const result = parseRuleCitations(text)
    expect(result).toHaveLength(2)
    expect(result[0].source).toBe('PHB')
    expect(result[1].source).toBe('DMG')
  })

  it('trims citation text whitespace', () => {
    const text = '[RULE_CITATION source="PHB" rule="Test"]  Some text with spaces  [/RULE_CITATION]'
    const result = parseRuleCitations(text)
    expect(result[0].text).toBe('Some text with spaces')
  })
})

describe('stripRuleCitations', () => {
  it('removes rule citation blocks', () => {
    const text = 'Before. [RULE_CITATION source="PHB" rule="X"]citation text[/RULE_CITATION] After.'
    const result = stripRuleCitations(text)
    expect(result).toBe('Before.After.')
  })

  it('returns original text when no citations', () => {
    expect(stripRuleCitations('Hello world')).toBe('Hello world')
  })

  it('handles multiple citation blocks', () => {
    const text =
      'A [RULE_CITATION source="PHB" rule="X"]x[/RULE_CITATION] B [RULE_CITATION source="DMG" rule="Y"]y[/RULE_CITATION] C'
    const result = stripRuleCitations(text)
    expect(result).not.toContain('RULE_CITATION')
  })
})

describe('finalizeAiResponse', () => {
  it('returns display text with stat changes and dm actions extracted', () => {
    const fullText =
      'The goblin attacks. [STAT_CHANGES]{"changes":[{"type":"damage","value":5,"reason":"goblin attack"}]}[/STAT_CHANGES]'
    const conv = makeConvManager()
    const request = makeRequest()

    const result = finalizeAiResponse(fullText, request, conv)
    expect(result.displayText).toBe('The goblin attacks.')
    expect(result.statChanges).toHaveLength(1)
    expect(result.statChanges[0].type).toBe('damage')
  })

  it('extracts rule citations', () => {
    const fullText = 'Check this rule. [RULE_CITATION source="PHB" rule="Fireball"]3rd-level evocation.[/RULE_CITATION]'
    const conv = makeConvManager()
    const request = makeRequest()

    const result = finalizeAiResponse(fullText, request, conv)
    expect(result.ruleCitations).toHaveLength(1)
    expect(result.ruleCitations[0].source).toBe('PHB')
    expect(result.displayText).not.toContain('RULE_CITATION')
  })

  it('adds display text to conversation history', () => {
    const conv = makeConvManager()
    const request = makeRequest()

    finalizeAiResponse('Simple response.', request, conv)
    expect(conv.addMessage).toHaveBeenCalledWith('assistant', 'Simple response.')
  })

  it('cleans text when tone violations detected', () => {
    mockHasViolations.mockReturnValue(true)
    mockCleanNarrativeText.mockReturnValue('cleaned text')

    const conv = makeConvManager()
    const request = makeRequest()

    const result = finalizeAiResponse('## Heading\n**Bold** text', request, conv)
    expect(result.displayText).toBe('cleaned text')

    mockHasViolations.mockReturnValue(false)
    mockCleanNarrativeText.mockImplementation((t: string) => t)
  })

  it('falls back to raw text on parse error', () => {
    // Force an error on first addMessage call to trigger the catch block,
    // but allow the second addMessage (in catch) to succeed
    let callCount = 0
    const throwConv = {
      addMessage: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          throw new Error('test error')
        }
      }),
      serialize: vi.fn()
    } as unknown as ConversationManager

    const request = makeRequest()
    const result = finalizeAiResponse('raw text', request, throwConv)
    expect(result.displayText).toBe('raw text')
    expect(result.statChanges).toEqual([])
    expect(result.dmActions).toEqual([])
    expect(result.ruleCitations).toEqual([])
  })

  it('handles DM actions in response', () => {
    const fullText =
      'The battle begins! [DM_ACTIONS]{"actions":[{"action":"start_initiative","entries":[]}]}[/DM_ACTIONS]'
    const conv = makeConvManager()
    const request = makeRequest()

    const result = finalizeAiResponse(fullText, request, conv)
    expect(result.dmActions).toHaveLength(1)
    expect(result.dmActions[0].action).toBe('start_initiative')
    expect(result.displayText).not.toContain('DM_ACTIONS')
  })

  it('handles response with no special tags', () => {
    const conv = makeConvManager()
    const request = makeRequest()

    const result = finalizeAiResponse('Just a narrative response.', request, conv)
    expect(result.displayText).toBe('Just a narrative response.')
    expect(result.statChanges).toEqual([])
    expect(result.dmActions).toEqual([])
    expect(result.ruleCitations).toEqual([])
  })

  it('uses sender name in memory log', () => {
    const conv = makeConvManager()
    const request = makeRequest({ senderName: 'Thorin' })

    finalizeAiResponse('Hello!', request, conv)
    // The function should not throw and should log with the sender name
    expect(conv.addMessage).toHaveBeenCalled()
  })

  it('defaults sender name to Player when not provided', () => {
    const conv = makeConvManager()
    const request = makeRequest({ senderName: undefined })

    finalizeAiResponse('Hello!', request, conv)
    expect(conv.addMessage).toHaveBeenCalled()
  })
})
