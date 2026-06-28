/**
 * PHASE-28 28E — director planning pass (opt-in `aiDm.directorEnabled`).
 *
 * An ASYNCHRONOUS post-pass planner (separate from the prose narrator) that produces private
 * pacing/foreshadowing/scene-frame notes injected into subsequent prompts. Runs after onDone so
 * narration latency is untouched (the arXiv 2502.19519 latency caveat); a failure degrades to
 * "keep the previous notes". When the oracle is on, an engine scene-test injects genuine surprise.
 *
 * `runDirectorPass` is the single named call site (PHASE-29 routes it by swapping provider+model).
 */

import { z } from 'zod'
import type { LLMProvider } from './clients/llm-provider'
import type { DirectorNotes } from './director-state'
import { getMemoryManager } from './memory/memory-manager'
import { sceneTest } from './oracle'
import { renderQuestLogBlock } from './quest-log'
import type { ChatMessage } from './types'

const RECENT_EXCHANGE_CAP = 12
const EXCHANGE_CHAR_CAP = 600

const DirectorSchema = z.object({
  sceneFrame: z.string(),
  pacing: z.enum(['build', 'peak', 'cooldown']),
  foreshadow: z.array(z.string()),
  encounterSuggestion: z.string(),
  secretToSurface: z.string()
})
const DIRECTOR_JSON_SCHEMA = z.toJSONSchema(DirectorSchema) as Record<string, unknown>

function parseDirectorResponse(content: string): DirectorNotes | null {
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
  const result = DirectorSchema.safeParse(parsed)
  return result.success ? result.data : null
}

export async function runDirectorPass(
  campaignId: string,
  recentExchanges: Array<{ role: string; content: string }>,
  provider: Pick<LLMProvider, 'structuredOnce'>,
  model: string,
  opts: { oracleEnabled: boolean },
  log?: (msg: string) => void
): Promise<void> {
  if (!provider.structuredOnce) {
    log?.('[AI Director] provider has no structuredOnce capability — skipping')
    return
  }
  const memMgr = getMemoryManager(campaignId)

  // Assemble compact planning inputs main-side.
  const [questLog, summary, factions] = await Promise.all([
    memMgr.getQuestLog(),
    memMgr.getWorldStateSummary(),
    memMgr.getFactionReputations()
  ])
  const lines: string[] = []
  const questBlock = renderQuestLogBlock(questLog)
  if (questBlock) lines.push(questBlock)
  if (summary) {
    const ws = [`Location: ${summary.currentLocation}`, `Time: ${summary.timeOfDay}`]
    if (summary.recentEvents.length) ws.push(`Recent: ${summary.recentEvents.slice(-5).join('; ')}`)
    lines.push(`[WORLD SUMMARY] ${ws.join('. ')}`)
  }
  if (factions.length) {
    lines.push(
      `[FACTION STANDINGS] ${factions.map((f) => `${f.factionName}: ${f.partyStanding >= 0 ? '+' : ''}${f.partyStanding}`).join(', ')}`
    )
  }

  // Engine scene-test (oracle on) injects genuine surprise the model must honour.
  if (opts.oracleEnabled) {
    const { chaos } = await memMgr.getOracleState()
    const st = sceneTest(chaos)
    const instruction =
      st.result === 'altered'
        ? 'introduce an unplanned complication that bends the expected scene'
        : st.result === 'interrupt'
          ? 'an unexpected event interrupts the scene — surface it now'
          : 'the scene proceeds as planned (no forced twist)'
    lines.push(`Scene test: ${st.result} — ${instruction}.`)
  }

  const transcript = recentExchanges
    .slice(-RECENT_EXCHANGE_CAP)
    .map((m) => `${m.role}: ${m.content.slice(0, EXCHANGE_CHAR_CAP)}`)
    .join('\n')

  const system =
    'You are the game DIRECTOR for a tabletop RPG — NOT the narrator. Plan pacing, foreshadowing, ' +
    'scene framing, and what should happen next. Keep each field short (one or two sentences). ' +
    `Respond ONLY as JSON matching this schema (no prose, no markdown fences):\n${JSON.stringify(DIRECTOR_JSON_SCHEMA)}`
  const user = `${lines.join('\n')}\n\nRecent exchanges:\n${transcript}`
  const messages: ChatMessage[] = [{ role: 'user', content: user }]

  let parsed: DirectorNotes | null = null
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    try {
      const content = await provider.structuredOnce(system, messages, model, DIRECTOR_JSON_SCHEMA)
      parsed = parseDirectorResponse(content)
    } catch (err) {
      log?.(`[AI Director] attempt ${attempt + 1} error: ${String(err)}`)
    }
  }
  if (!parsed) {
    // Failure ⇒ keep the previous notes untouched (stale notes beat no notes).
    log?.('[AI Director] no parseable response after retry — keeping prior notes')
    return
  }

  await memMgr.mutateDirectorState((s) => ({
    ...s,
    notes: parsed,
    generatedAt: new Date().toISOString(),
    responsesSinceRun: 0,
    enabledAtGeneration: true
  }))
}
