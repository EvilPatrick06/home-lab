/**
 * PHASE-28 28C — quest-objective auditor post-pass (opt-in `aiDm.questTrackingEnabled`).
 *
 * After a finalized AI response, a small structured LLM call proposes which pending objectives
 * the fiction just completed or failed. Constrained decoding guarantees SHAPE, not TRUTH — every
 * proposed update is filtered against the engine store (the questId/objectiveId must exist and be
 * `pending`) before it is applied via `mutateQuestLog`. Chapter advancement is only ever PROPOSED
 * (`pendingChapterAdvance`), never auto-applied — the DM owns pacing (28F confirm gate).
 *
 * `runQuestCheck` is the single named call site (PHASE-29 routes it by swapping provider+model).
 */

import { z } from 'zod'
import type { LLMProvider } from './clients/llm-provider'
import { getMemoryManager } from './memory/memory-manager'
import { chapterReadyToAdvance, type QuestLogFile, renderQuestLogBlock } from './quest-log'
import type { ChatMessage } from './types'

const EVIDENCE_CAP = 200
const RECENT_EXCHANGE_CAP = 6
const EXCHANGE_CHAR_CAP = 600

// Flat, small-model-friendly schema (enum + string only) per the structured-outputs research.
const QuestCheckSchema = z.object({
  updates: z.array(
    z.object({
      questId: z.string(),
      objectiveId: z.string(),
      result: z.enum(['completed', 'failed']),
      evidence: z.string()
    })
  )
})
const QUEST_CHECK_JSON_SCHEMA = z.toJSONSchema(QuestCheckSchema) as Record<string, unknown>

export interface AppliedObjectiveUpdate {
  questId: string
  objectiveId: string
  result: 'completed' | 'failed'
  quest: string
  objective: string
  evidence?: string
}
export interface QuestCheckResult {
  applied: AppliedObjectiveUpdate[]
  pendingChapterAdvance?: { proposedAt: string; reason: string }
}

/** Parse a structured response with a brace-slice fallback (mirrors structured-extraction.ts). */
function parseCheckResponse(content: string): z.infer<typeof QuestCheckSchema> | null {
  const raw = (content || '').trim()
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      parsed = JSON.parse(raw.slice(start, end + 1))
    } catch {
      return null
    }
  }
  const result = QuestCheckSchema.safeParse(parsed)
  return result.success ? result.data : null
}

function buildPrompts(
  file: QuestLogFile,
  recentExchanges: Array<{ role: string; content: string }>
): {
  system: string
  user: string
} {
  const system =
    'You are a quest-objective auditor for a tabletop RPG. Given the current quest log and the latest ' +
    'exchanges, identify objectives that were CLEARLY completed or failed in the fiction. Reference only the ' +
    'questId/objectiveId values shown in the quest log. ' +
    `Respond ONLY as JSON matching this schema (no prose, no markdown fences):\n${JSON.stringify(QUEST_CHECK_JSON_SCHEMA)}\n` +
    'If nothing was clearly completed or failed, output {"updates":[]}.'
  const transcript = recentExchanges
    .slice(-RECENT_EXCHANGE_CAP)
    .map((m) => `${m.role}: ${m.content.slice(0, EXCHANGE_CHAR_CAP)}`)
    .join('\n')
  const user = `${renderQuestLogBlock(file)}\n\nRecent exchanges:\n${transcript}`
  return { system, user }
}

export async function runQuestCheck(
  campaignId: string,
  recentExchanges: Array<{ role: string; content: string }>,
  provider: Pick<LLMProvider, 'structuredOnce'>,
  model: string,
  log?: (msg: string) => void
): Promise<QuestCheckResult> {
  const memMgr = getMemoryManager(campaignId)
  const file = await memMgr.getQuestLog()

  // Index pending objectives — no pending work ⇒ skip the LLM call entirely.
  const pending = new Map<string, { questName: string; objectiveId: string }>()
  for (const q of file.quests) {
    if (q.status === 'abandoned') continue
    for (const o of q.objectives) {
      if (o.status === 'pending') pending.set(`${q.id}::${o.id}`, { questName: q.name, objectiveId: o.id })
    }
  }
  if (pending.size === 0) return { applied: [] }
  if (!provider.structuredOnce) {
    log?.('[Quest Check] provider has no structuredOnce capability — skipping')
    return { applied: [] }
  }

  const { system, user } = buildPrompts(file, recentExchanges)
  const messages: ChatMessage[] = [{ role: 'user', content: user }]

  let parsed: z.infer<typeof QuestCheckSchema> | null = null
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const content = await provider.structuredOnce(system, messages, model, QUEST_CHECK_JSON_SCHEMA)
      parsed = parseCheckResponse(content)
    } catch (err) {
      log?.(`[Quest Check] attempt ${attempt + 1} error: ${String(err)}`)
    }
  }
  if (!parsed) {
    log?.('[Quest Check] no parseable response after retry — skipping')
    return { applied: [] }
  }

  // Filter against engine truth: only existing, still-pending objectives apply.
  const applied: AppliedObjectiveUpdate[] = []
  const seen = new Set<string>()
  for (const u of parsed.updates) {
    const key = `${u.questId}::${u.objectiveId}`
    if (seen.has(key)) continue
    const match = pending.get(key)
    if (!match) {
      log?.(`[Quest Check] dropped hallucinated/non-pending objective ${key}`)
      continue
    }
    seen.add(key)
    const evidence = u.evidence ? u.evidence.slice(0, EVIDENCE_CAP) : undefined
    await memMgr.mutateQuestLog(
      u.result === 'completed'
        ? { kind: 'complete_objective', questName: match.questName, objective: u.objectiveId, evidence }
        : { kind: 'fail_objective', questName: match.questName, objective: u.objectiveId }
    )
    applied.push({
      questId: u.questId,
      objectiveId: u.objectiveId,
      result: u.result,
      quest: match.questName,
      objective: u.objectiveId,
      evidence
    })
  }

  // Propose chapter advancement when every chapter-quest objective is done (never auto-advance).
  let pendingChapterAdvance: QuestCheckResult['pendingChapterAdvance']
  if (applied.length > 0) {
    const latest = await memMgr.getQuestLog()
    if (chapterReadyToAdvance(latest) && !latest.pendingChapterAdvance) {
      const reason = `Chapter quests complete: ${latest.quests
        .filter((q) => q.chapterQuest)
        .map((q) => q.name)
        .join(', ')}`
      const updated = await memMgr.mutateQuestLog({ kind: 'propose_chapter_advance', reason })
      pendingChapterAdvance = updated.pendingChapterAdvance
    }
  }

  return { applied, pendingChapterAdvance }
}
