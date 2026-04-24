import { describe, expect, it } from 'vitest'
import { estimateTokens, TOKEN_BUDGETS, trimToTokenBudget } from './token-budget'

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokens('ab')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })

  it('handles long text', () => {
    const text = 'a'.repeat(1000)
    expect(estimateTokens(text)).toBe(250)
  })
})

describe('trimToTokenBudget', () => {
  it('returns text unchanged if within budget', () => {
    const text = 'Hello world'
    expect(trimToTokenBudget(text, 100)).toBe(text)
  })

  it('trims text exceeding budget at paragraph boundary', () => {
    const text =
      'Paragraph one content here.\n\nParagraph two content here.\n\nParagraph three content here that is long.'
    const result = trimToTokenBudget(text, 15) // ~60 chars max
    expect(result).toContain('Paragraph one')
    expect(result).toContain('[...truncated]')
    expect(result.length).toBeLessThan(text.length)
  })

  it('handles text with no paragraph breaks', () => {
    const text = 'A'.repeat(200)
    const result = trimToTokenBudget(text, 10) // 40 chars max
    expect(result.length).toBeLessThanOrEqual(60) // 40 chars + truncation notice
    expect(result).toContain('[...truncated]')
  })
})

describe('TOKEN_BUDGETS', () => {
  it('has expected budget fields', () => {
    expect(TOKEN_BUDGETS.systemPrompt).toBe(1500)
    expect(TOKEN_BUDGETS.retrievedChunks).toBe(8000)
    expect(TOKEN_BUDGETS.srdData).toBe(2000)
    expect(TOKEN_BUDGETS.campaignData).toBe(2000)
    expect(TOKEN_BUDGETS.gameState).toBe(1500)
    expect(TOKEN_BUDGETS.conversationHistory).toBe(4000)
    expect(TOKEN_BUDGETS.responseBuffer).toBe(4000)
    expect(TOKEN_BUDGETS.memory).toBe(2000)
    expect(TOKEN_BUDGETS.total).toBe(25000)
  })
})
