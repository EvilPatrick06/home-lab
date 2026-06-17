/**
 * PHASE-23 — structured (constrained-decoding) extraction of D&D mechanics.
 *
 * A second, non-streaming Ollama call with a FLAT `format` schema extracts the
 * mechanical stat changes from the freeform narration the model just produced.
 * Constrained decoding guarantees SHAPE, not TRUTH — extracted values are mapped
 * to canonical `StatChange` objects and (in 23C/23E) validated against actual game
 * state before they enter the approval pipeline.
 *
 * Pure + cycle-free: imports only zod / ./types / ./ai-schemas / (type-only) the
 * snapshot. MUST NOT import ai-service or ollama-client (PHASE-29 routes the call
 * by passing the provider + model in).
 */

import { z } from 'zod'
import { validateStatChanges } from './ai-schemas'
import type { GameStateSnapshot } from './game-state-validation'
import type { LLMProvider } from './llm-provider'
import type { ChatMessage, StatChange } from './types'

// High-frequency character/creature mechanics. Exported so PHASE-27 can extend the
// verb set for its flat world-state deltas without restructuring the mapper.
export const EXTRACTION_CHANGE_TYPES = [
  'damage',
  'heal',
  'temp_hp',
  'add_condition',
  'remove_condition',
  'expend_spell_slot',
  'restore_spell_slot',
  'add_item',
  'remove_item',
  'gold',
  'xp',
  'add_exhaustion'
] as const

export type ExtractionChangeType = (typeof EXTRACTION_CHANGE_TYPES)[number]

// FLAT, small-model-friendly: one object shape, no unions, no optionals (sentinels
// '' / 0 instead), all fields required. `additionalProperties:false` is free from
// z.toJSONSchema. See F3/F8 + the research notes.
const ExtractedChangeSchema = z.object({
  type: z.enum(EXTRACTION_CHANGE_TYPES),
  target: z.string(), // character name or creature label; '' = the acting character
  value: z.number(), // amount (damage/heal/gold/xp/slot level/exhaustion levels); 0 when N/A
  name: z.string(), // condition/item name; '' when N/A
  reason: z.string()
})
export const ExtractionResultSchema = z.object({ changes: z.array(ExtractedChangeSchema) })
export type ExtractedChange = z.infer<typeof ExtractedChangeSchema>
export const EXTRACTION_JSON_SCHEMA = z.toJSONSchema(ExtractionResultSchema) as Record<string, unknown>

// Types that have a creature_* counterpart (can target a map creature).
const CREATURE_COMPATIBLE = new Set<ExtractionChangeType>(['damage', 'heal', 'add_condition', 'remove_condition'])

// ── Prompts ─────────────────────────────────────────────────────────

const TYPE_SEMANTICS: Record<ExtractionChangeType, string> = {
  damage: 'value = HP lost',
  heal: 'value = HP restored',
  temp_hp: 'value = temporary HP granted',
  add_condition: 'name = condition (e.g. poisoned, prone); value = 0',
  remove_condition: 'name = condition removed; value = 0',
  expend_spell_slot: 'value = slot level 1-9',
  restore_spell_slot: 'value = slot level 1-9',
  add_item: 'name = item; value = quantity (0 → 1)',
  remove_item: 'name = item; value = quantity (0 → 1)',
  gold: 'value = gold pieces gained (negative = spent)',
  xp: 'value = experience gained',
  add_exhaustion: 'value = exhaustion levels gained'
}

export function buildExtractionPrompts(
  narration: string,
  snapshot: GameStateSnapshot
): { system: string; user: string } {
  const semantics = EXTRACTION_CHANGE_TYPES.map((t) => `- ${t}: ${TYPE_SEMANTICS[t]}`).join('\n')
  const system =
    'You extract D&D 5e mechanical changes from a Dungeon Master narration. ' +
    'Respond ONLY as JSON matching this schema (no prose, no markdown fences):\n' +
    `${JSON.stringify(EXTRACTION_JSON_SCHEMA)}\n\n` +
    `Change types:\n${semantics}\n\n` +
    'target = the affected character name or creature label exactly as listed, or "" for the acting character. ' +
    'Use "" for name/0 for value when a field does not apply. ' +
    'If no mechanical changes occurred, return {"changes":[]}.'
  const party = snapshot.partyNames.length ? snapshot.partyNames.join(', ') : '(none)'
  const creatures = snapshot.creatureLabels.length ? snapshot.creatureLabels.join(', ') : '(none)'
  const user = `Party: ${party}\nCreatures on map: ${creatures}\n\nNarration:\n${narration}`
  return { system, user }
}

// ── Parsing ─────────────────────────────────────────────────────────

/** Parse the structured response. NEVER calls repairJson (23A rule — the structured
 *  path must not depend on the module it is retiring). Brace-slice fallback defends
 *  against the F5 markdown-fence corner. Returns null on unrecoverable garbage. */
export function parseExtractionResponse(content: string): { changes: ExtractedChange[] } | null {
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
  const result = ExtractionResultSchema.safeParse(parsed)
  return result.success ? result.data : null
}

// ── Target resolution + mapping ─────────────────────────────────────

function resolveTarget(target: string, names: string[]): { match: string | null; kind: 'exact' | 'prefix' | 'none' } {
  const q = target.trim().toLowerCase()
  if (!q) return { match: null, kind: 'none' }
  const exact = names.find((n) => n.toLowerCase() === q)
  if (exact) return { match: exact, kind: 'exact' }
  const prefixed = names.filter((n) => n.toLowerCase().startsWith(q))
  if (prefixed.length === 1) return { match: prefixed[0], kind: 'prefix' }
  return { match: null, kind: 'none' }
}

const CREATURE_TYPE: Partial<Record<ExtractionChangeType, StatChange['type']>> = {
  damage: 'creature_damage',
  heal: 'creature_heal',
  add_condition: 'creature_add_condition',
  remove_condition: 'creature_remove_condition'
}

/** Map flat extracted changes to canonical StatChange objects, resolving targets
 *  against the snapshot. Drops unresolved/incompatible entries with an issue string.
 *  Re-validates the mapped array through validateStatChanges so every downstream
 *  invariant holds. */
export function mapExtractedToStatChanges(
  extracted: ExtractedChange[],
  snapshot: GameStateSnapshot
): { changes: StatChange[]; issues: string[] } {
  const issues: string[] = []
  const mapped: StatChange[] = []

  for (const e of extracted) {
    const reason = e.reason || 'AI-extracted'
    // Resolve the referent: '' = acting character; else party, then creature.
    let characterName: string | undefined
    let targetLabel: string | undefined
    if (e.target.trim() === '') {
      characterName = undefined
    } else {
      const party = resolveTarget(e.target, snapshot.partyNames)
      if (party.match) {
        characterName = party.match
      } else {
        const creature = resolveTarget(e.target, snapshot.creatureLabels)
        if (creature.match) {
          targetLabel = creature.match
        } else {
          issues.push(`unknown target "${e.target}" (${e.type})`)
          continue
        }
      }
    }

    if (targetLabel !== undefined && !CREATURE_COMPATIBLE.has(e.type)) {
      issues.push(`type ${e.type} cannot target a creature ("${targetLabel}")`)
      continue
    }

    if (targetLabel !== undefined) {
      const ct = CREATURE_TYPE[e.type]
      if (e.type === 'add_condition' || e.type === 'remove_condition') {
        mapped.push({ type: ct, targetLabel, name: e.name, reason } as StatChange)
      } else {
        mapped.push({ type: ct, targetLabel, value: e.value, reason } as StatChange)
      }
      continue
    }

    // Character-targeted (or acting-character) mapping.
    switch (e.type) {
      case 'damage':
      case 'heal':
      case 'temp_hp':
      case 'gold':
      case 'xp':
        mapped.push({ type: e.type, characterName, value: e.value, reason } as StatChange)
        break
      case 'add_condition':
      case 'remove_condition':
        mapped.push({ type: e.type, characterName, name: e.name, reason } as StatChange)
        break
      case 'add_item':
      case 'remove_item':
        mapped.push({ type: e.type, characterName, name: e.name, quantity: e.value || 1, reason } as StatChange)
        break
      case 'expend_spell_slot':
      case 'restore_spell_slot':
        mapped.push({ type: e.type, characterName, level: e.value, reason } as StatChange)
        break
      case 'add_exhaustion':
        mapped.push({ type: e.type, characterName, levels: e.value, reason } as StatChange)
        break
    }
  }

  // Re-validate through the canonical schema so downstream invariants hold.
  const { valid, issues: validationIssues } = validateStatChanges(mapped)
  for (const vi of validationIssues) issues.push(...vi.errors)
  return { changes: valid as StatChange[], issues }
}

// ── Orchestrator (23E) ──────────────────────────────────────────────

/** Run the full extraction round-trip. Provider + model are passed in (no cycle;
 *  PHASE-29 routes by swapping these args). Returns null when the provider lacks the
 *  capability or anything throws (callers fall back to tag-parse results). */
export async function runStructuredExtraction(
  provider: Pick<LLMProvider, 'structuredOnce'>,
  model: string,
  narrationDisplayText: string,
  snapshot: GameStateSnapshot,
  log?: (msg: string) => void
): Promise<{ changes: StatChange[]; issues: string[] } | null> {
  if (!provider.structuredOnce) {
    log?.('[AI Extraction] provider has no structuredOnce capability — skipping')
    return null
  }
  try {
    const { system, user } = buildExtractionPrompts(narrationDisplayText, snapshot)
    const messages: ChatMessage[] = [{ role: 'user', content: user }]
    const content = await provider.structuredOnce(system, messages, model, EXTRACTION_JSON_SCHEMA)
    const parsed = parseExtractionResponse(content)
    if (!parsed) {
      log?.('[AI Extraction] response did not parse to the extraction schema')
      return null
    }
    return mapExtractedToStatChanges(parsed.changes, snapshot)
  } catch (err) {
    log?.(`[AI Extraction] error: ${String(err)}`)
    return null
  }
}
