/**
 * PHASE-25 25E — deterministic, keyword-triggered lore selection + the labeled `[LORE]`
 * block. Pure (no IO) so PHASE-31's Q&A assembler can reuse it. SillyTavern-style world
 * info: keyword-less entries are "constant" (always injected); keyed entries inject only
 * when a trigger word whole-word-matches the recent transcript + game-state snapshot.
 */

import { matchesKey } from './memory/entity-store'

export const LORE_SCAN_DEPTH = 4 // recent messages scanned for trigger keywords

// Main-side structural type; the renderer LoreEntry satisfies it (no cross-process import).
export interface LoreEntryLike {
  title: string
  content: string
  category?: string
  keywords?: string[]
}

/** Last LORE_SCAN_DEPTH message contents + the game-state snapshot, newline-joined.
 *  Including game state is what makes keys STATE-triggered (an entry keyed "under attack"
 *  fires while the snapshot says so) — the SillyTavern state variant without extra machinery. */
export function buildScanText(messages: Array<{ role: string; content: string }>, gameState?: string): string {
  const recent = messages.slice(-LORE_SCAN_DEPTH).map((m) => m.content)
  return [...recent, gameState ?? ''].join('\n')
}

/** 'all' → identity; 'triggered' → constant (keyword-less) entries + keyword matches.
 *  Original array order is preserved (stable output = prefix-cache-friendlier across turns). */
export function selectLore(entries: LoreEntryLike[], mode: 'all' | 'triggered', scanText: string): LoreEntryLike[] {
  if (mode === 'all') return entries
  return entries.filter((e) => {
    const keys = e.keywords ?? []
    if (keys.length === 0) return true // constant
    return keys.some((k) => matchesKey(scanText, k))
  })
}

/** `[LORE]\n- Title [category]: content\n…\n[/LORE]`. Empty array → ''. The entry-line
 *  format is byte-identical to the legacy inline lore lines; only the wrapper is new. */
export function buildLoreBlock(entries: LoreEntryLike[]): string {
  if (entries.length === 0) return ''
  const lines = ['[LORE]']
  for (const e of entries) lines.push(`- ${e.title} [${e.category || 'other'}]: ${e.content}`)
  lines.push('[/LORE]')
  return lines.join('\n')
}
