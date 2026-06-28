/**
 * PHASE-25 25C — opt-in post-turn entity auto-extraction.
 *
 * When `config.enabled && config.autoExtract` (both default false), a fire-and-forget
 * structured call after each completed AI turn drafts/refreshes entity records from the
 * narration (the WorldInfo-Recommender / Franz "research-and-record" pattern). Constrained
 * to ≤6 flat records per turn; dedupe is inherent to the store's upsert; locked (DM-edited)
 * records are never overwritten. Standalone module (no ai-service import → no cycle);
 * PHASE-29 may route this to a small model by swapping the provider/model arguments.
 */

import { z } from 'zod'
import { logToFile } from '../../log'
import type { LLMProvider } from '../clients/llm-provider'
import type { ChatMessage } from '../types'
import { getEntityStore } from './entity-store'

const MAX_ENTITIES_PER_TURN = 6

/** Flat JSON schema for constrained decoding (small-model discipline, like PHASE-23). */
export const EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      maxItems: MAX_ENTITIES_PER_TURN,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['npc', 'location', 'item', 'faction'] },
          name: { type: 'string' },
          summary: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' }, maxItems: 6 }
        },
        required: ['kind', 'name', 'summary'],
        additionalProperties: false
      }
    }
  },
  required: ['entities'],
  additionalProperties: false
}

// Tolerant parsing schema (no .max — we cap downstream so an over-long list still parses).
const ExtractionResultSchema = z.object({
  entities: z.array(
    z.object({
      kind: z.enum(['npc', 'location', 'item', 'faction']),
      name: z.string().min(1),
      summary: z.string(),
      keywords: z.array(z.string()).optional()
    })
  )
})

export interface ExtractedEntity {
  kind: 'npc' | 'location' | 'item' | 'faction'
  name: string
  summary: string
  keywords?: string[]
}

export function buildExtractionPrompt(narration: string, knownNames: string[]): { system: string; user: string } {
  const known = knownNames.length ? knownNames.join(', ') : '(none yet)'
  const system = [
    "You extract durable campaign entities from a Dungeon Master's narration.",
    'Return ONLY named, campaign-significant NPCs, locations, items, or factions that are',
    'introduced or substantially developed in THIS narration. Skip generic objects, scenery,',
    'and the player characters. Each entity is { kind, name, summary, keywords? } where kind',
    'is one of "npc", "location", "item", "faction" and summary is ONE concise sentence.',
    'Respond as JSON: {"entities": [...]}. If nothing qualifies, respond exactly {"entities": []}.',
    `Known records — only include one of these if THIS narration adds NEW information about it: ${known}.`
  ].join('\n')
  const user = `Narration:\n${narration}`
  return { system, user }
}

function tolerantParse(content: string): ExtractedEntity[] | null {
  try {
    const stripped = content.replace(/```(?:json)?/gi, '').trim()
    const parsed = ExtractionResultSchema.safeParse(JSON.parse(stripped))
    if (!parsed.success) return null
    return parsed.data.entities
  } catch {
    return null
  }
}

/** One extraction round-trip. Prefers PHASE-23's `structuredOnce` (constrained decoding);
 *  falls back to `chatOnce` + tolerant parse. Any failure logs a WARN and returns null. */
export async function extractEntities(
  provider: LLMProvider,
  model: string,
  narration: string,
  knownNames: string[]
): Promise<ExtractedEntity[] | null> {
  const { system, user } = buildExtractionPrompt(narration, knownNames)
  const messages: ChatMessage[] = [{ role: 'user', content: user }]
  try {
    const content =
      'structuredOnce' in provider && typeof provider.structuredOnce === 'function'
        ? await provider.structuredOnce(system, messages, model, EXTRACTION_SCHEMA)
        : await provider.chatOnce(system, messages, model)
    return tolerantParse(content)
  } catch (err) {
    logToFile('WARN', `[AI Entities] extraction call failed: ${String(err)}`)
    return null
  }
}

/** Orchestrator: bails unless enabled && autoExtract; extracts; upserts (≤6, source:'extraction').
 *  Never throws to its caller (fire-and-forget from the stream-done path). */
export async function runEntityExtraction(
  campaignId: string,
  provider: LLMProvider,
  model: string,
  narration: string
): Promise<void> {
  const store = getEntityStore(campaignId)
  const config = await store.getConfig()
  if (!config.enabled || !config.autoExtract) return
  const { records } = await store.getSnapshot()
  const knownNames = records.map((r) => r.name)
  const entities = await extractEntities(provider, model, narration, knownNames)
  if (!entities) return
  for (const e of entities.slice(0, MAX_ENTITIES_PER_TURN)) {
    await store.upsertEntity({
      kind: e.kind,
      name: e.name,
      summary: e.summary,
      keywords: e.keywords,
      source: 'extraction'
    })
  }
}
