/**
 * Browser-safe extraction of structured AI-DM mutations from narration text.
 *
 * Mirrors the desktop main-process "tag path" (parseStatChangesDetailed /
 * parseDmActionsDetailed) by reusing the SAME canonical zod schemas + JSON
 * repair from `ai-schemas.ts` — which is browser-pure (only `zod` and a shared
 * spec), so importing it into the web bundle pulls in no Node/Electron code.
 *
 * The renderer already APPLIES `statChanges` / `dmActions` (via the AI store and
 * `services/game-action-executor.ts`), so parsing the tags the LLM embeds in the
 * narration and emitting the validated arrays in `ai:stream-done` makes web
 * mechanics behave like desktop. Malformed blocks are skipped — the prose still
 * shows.
 */
import {
  DmActionsBlockSchema,
  repairJsonDetailed,
  StatChangesBlockSchema,
  validateDmActions,
  validateStatChanges
} from '../main/ai/ai-schemas'

const STAT_BLOCK = /\[STAT_CHANGES\]\s*([\s\S]*?)\s*\[\/STAT_CHANGES\]/g
const DM_BLOCK = /\[DM_ACTIONS\]\s*([\s\S]*?)\s*\[\/DM_ACTIONS\]/g

export interface ParsedAiMutations {
  statChanges: unknown[]
  dmActions: Array<{ action: string; [k: string]: unknown }>
  displayText: string
}

/** Harvest + validate every [STAT_CHANGES]/[DM_ACTIONS] block; return the clean prose. */
export function parseAiMutations(text: string): ParsedAiMutations {
  const statChanges: unknown[] = []
  for (const m of text.matchAll(STAT_BLOCK)) {
    try {
      const { repaired } = repairJsonDetailed(m[1])
      const block = StatChangesBlockSchema.safeParse(JSON.parse(repaired))
      if (block.success) statChanges.push(...validateStatChanges(block.data.changes as unknown[]).valid)
    } catch {
      // skip malformed block — narration still renders
    }
  }

  const dmActions: Array<{ action: string; [k: string]: unknown }> = []
  for (const m of text.matchAll(DM_BLOCK)) {
    try {
      const { repaired } = repairJsonDetailed(m[1])
      const block = DmActionsBlockSchema.safeParse(JSON.parse(repaired))
      if (block.success) dmActions.push(...validateDmActions(block.data.actions as unknown[]).valid)
    } catch {
      // skip malformed block
    }
  }

  const displayText = text
    .replace(/\s*\[STAT_CHANGES\][\s\S]*?\[\/STAT_CHANGES\]\s*/g, ' ')
    .replace(/\s*\[DM_ACTIONS\][\s\S]*?\[\/DM_ACTIONS\]\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return { statChanges, dmActions, displayText }
}
