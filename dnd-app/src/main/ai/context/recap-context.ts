/**
 * PHASE-31 31B — "Previously on…" session-start recap prompt assembly (pure, no I/O).
 *
 * Builds a one-shot prompt from the campaign's own record (conversation summaries, last session log,
 * world summary, saved recaps). Grounded — the recap is based ONLY on the supplied blocks. Each block
 * is bounded so the call stays small (the recap is a single non-streaming `chatOnce`).
 */

import type { WorldStateSummary } from '../types'
import { trimToTokenBudget } from './token-budget'

const BLOCK_BUDGET = 1500 // estimated tokens per block

export interface SessionStartRecapInputs {
  conversationSummaries: string[] // ConversationData.summaries[].content
  latestSessionLog: string // memory-manager getSessionLog(latest date)
  worldSummary: WorldStateSummary | null // activeQuests + recentEvents
  journalRecaps: Array<{ title: string; content: string }> // authorId === 'ai-dm', last 2
}

/** True when every input is empty (a brand-new campaign with no history). */
export function recapInputsEmpty(inputs: SessionStartRecapInputs): boolean {
  return (
    inputs.conversationSummaries.length === 0 &&
    inputs.latestSessionLog.trim() === '' &&
    inputs.journalRecaps.length === 0 &&
    !(
      inputs.worldSummary &&
      (inputs.worldSummary.activeQuests.length > 0 || inputs.worldSummary.recentEvents.length > 0)
    )
  )
}

export function buildSessionStartRecapPrompt(inputs: SessionStartRecapInputs): { system: string; user: string } {
  const system =
    'You are the narrator of a "Previously on…" recap for an ongoing tabletop RPG campaign. In a dramatic, ' +
    'cinematic TV-intro voice, remind the players where the party is, what they accomplished, what threats ' +
    'loom, and what threads are unresolved. Name the characters and places. 4–8 sentences. END on a hook that ' +
    'sets up tonight. Do NOT mention mechanics (HP, spell slots, dice). Base the recap ONLY on the records below ' +
    '— never invent events that are not recorded.'

  const sections: string[] = []
  if (inputs.conversationSummaries.length > 0) {
    sections.push(
      `[CONVERSATION SUMMARIES]\n${trimToTokenBudget(inputs.conversationSummaries.join('\n\n'), BLOCK_BUDGET)}`
    )
  }
  if (inputs.latestSessionLog.trim()) {
    sections.push(`[LAST SESSION LOG]\n${trimToTokenBudget(inputs.latestSessionLog, BLOCK_BUDGET)}`)
  }
  if (inputs.worldSummary) {
    const ws = inputs.worldSummary
    const parts: string[] = [`Location: ${ws.currentLocation}`]
    if (ws.activeQuests.length > 0) parts.push(`Active quests: ${ws.activeQuests.join('; ')}`)
    if (ws.recentEvents.length > 0) parts.push(`Recent events: ${ws.recentEvents.join('; ')}`)
    sections.push(`[WORLD SUMMARY]\n${trimToTokenBudget(parts.join('\n'), BLOCK_BUDGET)}`)
  }
  if (inputs.journalRecaps.length > 0) {
    const text = inputs.journalRecaps.map((r) => `${r.title}\n${r.content}`).join('\n\n')
    sections.push(`[SAVED RECAPS]\n${trimToTokenBudget(text, BLOCK_BUDGET)}`)
  }

  const user = `${sections.join('\n\n')}\n\nWrite the "Previously on…" recap now, drawing ONLY on the records above.`
  return { system, user }
}

// Exported so callers can sanity-check the assembled size before dispatching.
