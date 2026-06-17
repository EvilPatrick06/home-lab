import type { RuleCitation } from './types'

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
// PHASE-21 21C: named-NPC speaker tag — display name (not lower-cased), bounded.
const VOICE_SPEAKER_RE = /\[SPEAKER:\s*([^\]\n]{1,40}?)\s*\]/i

/**
 * Extract the optional voice tags the AI may emit so DM-BMO can modulate tone/pitch
 * per character in the Discord voice channel: `[NPC:archetype]` (one of the DM-BMO
 * prosody archetypes, e.g. gruff_dwarf, mysterious_elf, booming_dragon) and
 * `[EMOTION:mood]`. First match wins (the dominant voice for the narration).
 */
export function parseVoiceTags(text: string): { npc?: string; emotion?: string; speaker?: string } {
  return {
    npc: text.match(VOICE_NPC_RE)?.[1]?.toLowerCase(),
    emotion: text.match(VOICE_EMOTION_RE)?.[1]?.toLowerCase(),
    // Speaker is a display name — keep its case, just trim (21C).
    speaker: text.match(VOICE_SPEAKER_RE)?.[1]?.trim() || undefined
  }
}

/** Strip every voice tag so they never appear in the in-game chat text. Preserves
 *  newlines; only collapses the horizontal whitespace a removed tag leaves behind. */
export function stripVoiceTags(text: string): string {
  return text
    .replace(/\[NPC:\s*[a-z_]+\s*\]/gi, '')
    .replace(/\[EMOTION:\s*[a-z_]+\s*\]/gi, '')
    .replace(/\[SPEAKER:[^\]\n]{1,40}\]/gi, '')
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
