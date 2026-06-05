import { logToFile } from '../log'
import { saveConversation } from '../storage/ai-conversation-storage'
import type { ValidationIssue } from './ai-schemas'
import type { ConversationManager } from './conversation-manager'
import { parseDmActionsDetailed, stripDmActions } from './dm-actions'
import { getMemoryManager } from './memory-manager'
import { parseStatChangesDetailed, stripStatChanges } from './stat-mutations'
import { cleanNarrativeText, hasViolations } from './tone-validator'
import type { AiChatRequest, DmActionData, RuleCitation, StatChange } from './types'

const RULE_CITATION_RE = /\[RULE_CITATION source="([^"]*)" rule="([^"]*)"\]([\s\S]*?)\[\/RULE_CITATION\]/g

export function parseRuleCitations(text: string): RuleCitation[] {
  const citations: RuleCitation[] = []
  const re = new RegExp(RULE_CITATION_RE.source, 'g')
  let match: RegExpExecArray | null
  for (;;) {
    match = re.exec(text)
    if (match === null) break
    citations.push({ source: match[1], rule: match[2], text: match[3].trim() })
  }
  return citations
}

export function stripRuleCitations(text: string): string {
  return text.replace(/\s*\[RULE_CITATION[^\]]*\][\s\S]*?\[\/RULE_CITATION\]\s*/g, '').trim()
}

const VOICE_NPC_RE = /\[NPC:\s*([a-z_]+)\s*\]/i
const VOICE_EMOTION_RE = /\[EMOTION:\s*([a-z_]+)\s*\]/i

/**
 * Extract the optional voice tags the AI may emit so DM-BMO can modulate tone/pitch
 * per character in the Discord voice channel: `[NPC:archetype]` (one of the DM-BMO
 * prosody archetypes, e.g. gruff_dwarf, mysterious_elf, booming_dragon) and
 * `[EMOTION:mood]`. First match wins (the dominant voice for the narration).
 */
export function parseVoiceTags(text: string): { npc?: string; emotion?: string } {
  return {
    npc: text.match(VOICE_NPC_RE)?.[1]?.toLowerCase(),
    emotion: text.match(VOICE_EMOTION_RE)?.[1]?.toLowerCase()
  }
}

/** Strip every voice tag so they never appear in the in-game chat text. Preserves
 *  newlines; only collapses the horizontal whitespace a removed tag leaves behind. */
export function stripVoiceTags(text: string): string {
  return text
    .replace(/\[NPC:\s*[a-z_]+\s*\]/gi, '')
    .replace(/\[EMOTION:\s*[a-z_]+\s*\]/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const RULING_RE = /\[RULING question="([^"]*)"(?:\s+citation="([^"]*)")?\]([\s\S]*?)\[\/RULING\]/g

export interface ParsedRuling {
  question: string
  ruling: string
  citation: string
}

/**
 * Extract DM house-rulings the AI records for table consistency:
 * `[RULING question="..." citation="PHB p.X"]the ruling[/RULING]` (citation optional).
 * These persist to the campaign's rulings ledger (memory-manager) so future context
 * surfaces them in the [DM RULINGS] block and the AI rules the same way next time.
 * Entries with an empty question or body are skipped.
 */
export function parseRulings(text: string): ParsedRuling[] {
  const out: ParsedRuling[] = []
  const re = new RegExp(RULING_RE.source, 'g')
  let match: RegExpExecArray | null
  for (;;) {
    match = re.exec(text)
    if (match === null) break
    const question = match[1].trim()
    const ruling = match[3].trim()
    if (!question || !ruling) continue
    out.push({ question, ruling, citation: (match[2] ?? '').trim() })
  }
  return out
}

/** Strip every [RULING]…[/RULING] block so the bookkeeping never reaches chat. */
export function stripRulings(text: string): string {
  return text.replace(/\s*\[RULING[^\]]*\][\s\S]*?\[\/RULING\]\s*/g, '').trim()
}

export interface FinalizedResponse {
  fullText: string
  displayText: string
  statChanges: StatChange[]
  dmActions: DmActionData[]
  ruleCitations: RuleCitation[]
  validationIssues: ValidationIssue[]
}

/**
 * Parse and finalize an AI response: clean narrative text, extract stat
 * changes and DM actions, save to conversation history and memory manager.
 *
 * Returns the finalized result or falls back to raw text on parse errors.
 */
export function finalizeAiResponse(
  fullText: string,
  request: AiChatRequest,
  conv: ConversationManager
): FinalizedResponse {
  try {
    let cleaned = fullText
    if (hasViolations(cleaned)) {
      cleaned = cleanNarrativeText(cleaned)
    }

    const statResult = parseStatChangesDetailed(cleaned)
    const dmResult = parseDmActionsDetailed(cleaned)
    const ruleCitations = parseRuleCitations(cleaned)
    const rulings = parseRulings(cleaned)
    const displayText = stripRulings(stripRuleCitations(stripDmActions(stripStatChanges(cleaned))))

    const allIssues = [...statResult.issues, ...dmResult.issues]
    if (statResult.rawJsonError) {
      allIssues.push({ index: -1, input: null, errors: [statResult.rawJsonError] })
    }
    if (dmResult.rawJsonError) {
      allIssues.push({ index: -1, input: null, errors: [dmResult.rawJsonError] })
    }

    if (allIssues.length > 0) {
      logToFile(
        'WARN',
        `[AI Schema] Response had ${allIssues.length} validation issue(s): ${allIssues.length} item(s) rejected`
      )
    }

    conv.addMessage('assistant', displayText)

    saveConversation(request.campaignId, conv.serialize()).catch((err) =>
      logToFile('ERROR', '[AI] Failed to auto-save conversation:', String(err))
    )

    try {
      const memMgr = getMemoryManager(request.campaignId)
      const sessionId = new Date().toISOString().slice(0, 10)
      const logEntry = `[${request.senderName ?? 'Player'}]: ${request.message}\n[AI DM]: ${displayText.slice(0, 500)}`
      memMgr.appendSessionLog(sessionId, logEntry).catch(() => {})
      // Persist any house-rulings the AI just recorded so they surface in future
      // context's [DM RULINGS] block (the read side already exists; this is the
      // missing write side).
      for (const r of rulings) {
        memMgr
          .addRuling({ question: r.question, ruling: r.ruling, citation: r.citation, overriddenByDM: false })
          .catch(() => {})
      }
    } catch {
      // Non-fatal
    }

    return {
      fullText: cleaned,
      displayText,
      statChanges: statResult.changes,
      dmActions: dmResult.actions,
      ruleCitations,
      validationIssues: allIssues
    }
  } catch (err) {
    logToFile('ERROR', '[AI] Error parsing AI response, delivering raw text:', String(err))
    conv.addMessage('assistant', fullText)
    return { fullText, displayText: fullText, statChanges: [], dmActions: [], ruleCitations: [], validationIssues: [] }
  }
}
