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
  /** True if ANY section's content was actually trimmed to fit its budget. */
  truncated?: boolean
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

// ── Effective context window + budget scaling (PHASE-01 01C) ──────────────
//
// The raw section budgets above were authored for a ~25k assumed window, but
// local Ollama runs default to ~4k and even a tuned 16k window can't hold the
// raw sum once the ~12.3k static system prompt is subtracted. These helpers
// scale the *consumed* dynamic sections to whatever window is actually active so
// trimming happens visibly here (and is flagged) rather than silently in
// Ollama's runner (which drops the front of the prompt). All math is in the
// chars/4 estimator's units, which over-counts dense prose ~25% vs the llama
// tokenizer — i.e. conservative-safe (estimator-fits ⇒ real-fits).

import { logToFile } from '../log'
import { assembleSystemPrompt } from './prompt-assembler'

/** Cloud providers expose ≥100k real windows — budgets apply unscaled there. */
export const CLOUD_CONTEXT_WINDOW = 100_000
/** Reserved for the model's own output (generation) when sizing the prompt. */
export const OUTPUT_RESERVE = 2000
/** Reserved for the conditional add-on prompt blocks (combat tactics, planar,
 *  toolbox) that toggle at scene granularity on top of the static base. */
const CONDITIONAL_RESERVE = 1500

let activeContextWindow = CLOUD_CONTEXT_WINDOW
let effectiveBudgetsMemo: { window: number; value: EffectiveBudgets } | null = null
let warnedWindows = new Set<number>()

/** Set the window used for budget math. Ollama → resolved num_ctx; cloud →
 *  CLOUD_CONTEXT_WINDOW. Invalidates the memo. */
export function setActiveContextWindow(tokens: number): void {
  activeContextWindow = tokens
  effectiveBudgetsMemo = null
}
export function getActiveContextWindow(): number {
  return activeContextWindow
}

let staticPromptMemo: number | null = null
/** Lazy, cached estimate of the static system-prompt cost (the rules base). */
export function getStaticSystemPromptTokens(): number {
  if (staticPromptMemo === null) staticPromptMemo = estimateTokens(assembleSystemPrompt('general'))
  return staticPromptMemo
}

export interface EffectiveBudgets {
  retrievedChunks: number
  srdData: number
  campaignData: number
  creatures: number
  gameState: number
  memory: number
  conversationHistory: number
}

const SECTION_FLOORS: EffectiveBudgets = {
  retrievedChunks: 600,
  srdData: 200,
  campaignData: 200,
  creatures: 200,
  gameState: 200,
  memory: 200,
  conversationHistory: 1000
}

/** Raw section budgets actually consumed by the trimmer (the 7 dynamic ones). */
function rawBudgets(): EffectiveBudgets {
  return {
    retrievedChunks: TOKEN_BUDGETS.retrievedChunks,
    srdData: TOKEN_BUDGETS.srdData,
    campaignData: TOKEN_BUDGETS.campaignData,
    creatures: TOKEN_BUDGETS.creatures,
    gameState: TOKEN_BUDGETS.gameState,
    memory: TOKEN_BUDGETS.memory,
    conversationHistory: TOKEN_BUDGETS.conversationHistory
  }
}

/** Section budgets scaled to the active window. If the window comfortably holds
 *  the raw sum the raw budgets are returned unchanged (cloud + large local
 *  windows are byte-identical to the pre-phase behavior). Otherwise each section
 *  scales by `available/sum` with per-section floors; if even the floors don't
 *  fit, the budgets pin at floors and a one-time WARN is logged (the prompt WILL
 *  overflow — the truncation flag still reports it honestly). Memoized per window. */
export function getEffectiveBudgets(): EffectiveBudgets {
  if (effectiveBudgetsMemo && effectiveBudgetsMemo.window === activeContextWindow) {
    return effectiveBudgetsMemo.value
  }
  const raw = rawBudgets()
  const rawSum = Object.values(raw).reduce((a, c) => a + c, 0)
  const available = activeContextWindow - getStaticSystemPromptTokens() - OUTPUT_RESERVE - CONDITIONAL_RESERVE

  let value: EffectiveBudgets
  if (available >= rawSum) {
    value = raw
  } else {
    const floorSum = Object.values(SECTION_FLOORS).reduce((a, c) => a + c, 0)
    if (available < floorSum) {
      if (!warnedWindows.has(activeContextWindow)) {
        warnedWindows.add(activeContextWindow)
        logToFile(
          'WARN',
          `Context window ${activeContextWindow} too small for the static prompt (~${getStaticSystemPromptTokens()} tokens) + section floors (${floorSum}); pinning sections at floors — the prompt will overflow and be flagged truncated.`
        )
      }
      value = { ...SECTION_FLOORS }
    } else {
      const scale = available / rawSum
      value = {
        retrievedChunks: Math.max(SECTION_FLOORS.retrievedChunks, Math.floor(raw.retrievedChunks * scale)),
        srdData: Math.max(SECTION_FLOORS.srdData, Math.floor(raw.srdData * scale)),
        campaignData: Math.max(SECTION_FLOORS.campaignData, Math.floor(raw.campaignData * scale)),
        creatures: Math.max(SECTION_FLOORS.creatures, Math.floor(raw.creatures * scale)),
        gameState: Math.max(SECTION_FLOORS.gameState, Math.floor(raw.gameState * scale)),
        memory: Math.max(SECTION_FLOORS.memory, Math.floor(raw.memory * scale)),
        conversationHistory: Math.max(SECTION_FLOORS.conversationHistory, Math.floor(raw.conversationHistory * scale))
      }
    }
  }
  effectiveBudgetsMemo = { window: activeContextWindow, value }
  return value
}

/** Test-only reset of the one-time-warn dedupe set. */
export function _resetBudgetWarnings(): void {
  warnedWindows = new Set<number>()
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
