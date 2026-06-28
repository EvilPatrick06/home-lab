import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../log', () => ({ logToFile: vi.fn() }))

import { logToFile } from '../../log'
import {
  _resetBudgetWarnings,
  CLOUD_CONTEXT_WINDOW,
  estimateTokens,
  getActiveContextWindow,
  getEffectiveBudgets,
  getStaticSystemPromptTokens,
  OUTPUT_RESERVE,
  setActiveContextWindow,
  TOKEN_BUDGETS,
  trimToTokenBudget
} from './token-budget'

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
  it('is internally consistent: total = sum of consumed dynamic sections', () => {
    const consumed =
      TOKEN_BUDGETS.retrievedChunks +
      TOKEN_BUDGETS.srdData +
      TOKEN_BUDGETS.campaignData +
      TOKEN_BUDGETS.campaignDocs +
      TOKEN_BUDGETS.creatures +
      TOKEN_BUDGETS.gameState +
      TOKEN_BUDGETS.memory +
      TOKEN_BUDGETS.conversationHistory
    expect(TOKEN_BUDGETS.total).toBe(consumed)
    expect(TOKEN_BUDGETS.total).toBe(23500) // PHASE-24 24D: +2000 campaignDocs
  })
  it('systemPrompt reflects the measured static cost (~12.3k), not the old 1500', () => {
    expect(TOKEN_BUDGETS.systemPrompt).toBeGreaterThan(10000)
  })
})

describe('effective budgets (PHASE-01 01C)', () => {
  afterEach(() => {
    setActiveContextWindow(CLOUD_CONTEXT_WINDOW)
    _resetBudgetWarnings()
    vi.restoreAllMocks()
  })

  it('returns raw budgets unchanged at the cloud window (regression guard)', () => {
    setActiveContextWindow(CLOUD_CONTEXT_WINDOW)
    const b = getEffectiveBudgets()
    expect(b.retrievedChunks).toBe(TOKEN_BUDGETS.retrievedChunks)
    expect(b.srdData).toBe(TOKEN_BUDGETS.srdData)
    expect(b.campaignData).toBe(TOKEN_BUDGETS.campaignData)
    expect(b.creatures).toBe(TOKEN_BUDGETS.creatures)
    expect(b.gameState).toBe(TOKEN_BUDGETS.gameState)
    expect(b.memory).toBe(TOKEN_BUDGETS.memory)
    expect(b.conversationHistory).toBe(TOKEN_BUDGETS.conversationHistory)
  })

  it('scales sections proportionally when the window is tight but above floors', () => {
    // Pick a window where available is between floorSum and rawSum so scaling kicks in.
    const w = getStaticSystemPromptTokens() + OUTPUT_RESERVE + 1500 + 9000 // available ≈ 9000
    setActiveContextWindow(w)
    const b = getEffectiveBudgets()
    const sum =
      b.retrievedChunks + b.srdData + b.campaignData + b.creatures + b.gameState + b.memory + b.conversationHistory
    // Scaled sum must be below the raw sum and at/above the available room's order.
    expect(sum).toBeLessThan(21500)
    expect(b.retrievedChunks).toBeLessThan(TOKEN_BUDGETS.retrievedChunks)
    expect(b.retrievedChunks).toBeGreaterThanOrEqual(600) // floor respected
  })

  it('pins at floors and warns once when the window cannot hold static + floors', () => {
    vi.mocked(logToFile).mockClear()
    setActiveContextWindow(getStaticSystemPromptTokens() + 1000) // far too small
    const b = getEffectiveBudgets()
    expect(b.conversationHistory).toBe(1000) // the floor
    expect(b.retrievedChunks).toBe(600)
    expect(vi.mocked(logToFile)).toHaveBeenCalledTimes(1)
    // second call at the same window does not re-warn (dedup)
    getEffectiveBudgets()
    expect(vi.mocked(logToFile)).toHaveBeenCalledTimes(1)
  })

  it('memoizes per window and invalidates on change', () => {
    setActiveContextWindow(CLOUD_CONTEXT_WINDOW)
    const a = getEffectiveBudgets()
    expect(getEffectiveBudgets()).toBe(a) // same object (memoized)
    setActiveContextWindow(30000)
    expect(getEffectiveBudgets()).not.toBe(a)
    expect(getActiveContextWindow()).toBe(30000)
  })
})
