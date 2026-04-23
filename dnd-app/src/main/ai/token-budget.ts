/**
 * Approximate token counting — ~4 chars per token on average.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface ContextTokenBreakdown {
  rulebookChunks: number
  srdData: number
  characterData: number
  campaignData: number
  creatures: number
  gameState: number
  memory: number
  total: number
}

import tokenBudgetsJson from '../data/token-budgets.json'

export const TOKEN_BUDGETS = tokenBudgetsJson as {
  readonly systemPrompt: number
  readonly retrievedChunks: number
  readonly srdData: number
  readonly campaignData: number
  readonly creatures: number
  readonly gameState: number
  readonly memory: number
  readonly conversationHistory: number
  readonly responseBuffer: number
  readonly fileReadContent: number
  readonly webSearchResults: number
  readonly total: number
}

/**
 * Trim text to fit within a token budget, cutting at paragraph boundaries.
 */
export function trimToTokenBudget(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text

  const maxChars = maxTokens * 4
  const trimmed = text.slice(0, maxChars)
  const lastParagraph = trimmed.lastIndexOf('\n\n')
  if (lastParagraph > maxChars * 0.5) {
    return `${trimmed.slice(0, lastParagraph)}\n\n[...truncated]`
  }
  return `${trimmed}\n[...truncated]`
}
