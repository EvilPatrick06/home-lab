/**
 * PHASE-23 23C — "constrained decoding guarantees shape, not truth".
 *
 * Pure functions that build a referent snapshot (party names + map-creature labels)
 * and validate / bound-check / dedupe `StatChange` arrays against it, so a
 * schema-valid hallucination ("Bob" damage 99999 against a party of Aria/Korgan)
 * never reaches the approval UI. Imports only ./types + ./character-context.
 */

import { loadCharacterById } from './context/character-context'
import type { AiChatRequest, StatChange } from './types'

export interface GameStateSnapshot {
  partyNames: string[] // resolved character names for request.characterIds
  creatureLabels: string[] // request.activeCreatures?.map(c => c.label) ?? []
}

export async function buildGameStateSnapshot(request: AiChatRequest): Promise<GameStateSnapshot> {
  const partyNames: string[] = []
  for (const id of request.characterIds ?? []) {
    try {
      const ch = await loadCharacterById(id)
      const name = ch && typeof ch.name === 'string' ? ch.name : null
      if (name) partyNames.push(name)
    } catch {
      // Tolerate a failing load — skip the id, keep going.
    }
  }
  const creatureLabels = (request.activeCreatures ?? []).map((c) => c.label).filter(Boolean)
  return { partyNames, creatureLabels }
}

// ── Referent matching ───────────────────────────────────────────────

function matches(value: string, names: string[]): boolean {
  const q = value.trim().toLowerCase()
  if (!q) return false
  if (names.some((n) => n.toLowerCase() === q)) return true
  return names.filter((n) => n.toLowerCase().startsWith(q)).length === 1
}

// ── Bounds (reject-only; rejection text names the bound) ─────────────

interface BoundCheck {
  ok: (c: Record<string, unknown>) => boolean
  reason: string
}

const num = (c: Record<string, unknown>, k: string): number => (typeof c[k] === 'number' ? (c[k] as number) : NaN)
const inRange = (v: number, lo: number, hi: number): boolean => Number.isFinite(v) && v >= lo && v <= hi
const isInt = (v: number): boolean => Number.isInteger(v)

const HP_TYPES = new Set(['damage', 'heal', 'creature_damage', 'creature_heal'])
const SLOT_TYPES = new Set([
  'expend_spell_slot',
  'restore_spell_slot',
  'creature_expend_spell_slot',
  'creature_restore_spell_slot'
])

function boundCheck(change: StatChange): BoundCheck | null {
  const c = change as unknown as Record<string, unknown>
  if (HP_TYPES.has(change.type)) {
    return { ok: () => inRange(num(c, 'value'), 1, 1000), reason: 'value out of [1,1000]' }
  }
  switch (change.type) {
    case 'temp_hp':
      return { ok: () => inRange(num(c, 'value'), 0, 1000), reason: 'temp_hp out of [0,1000]' }
    case 'gold':
      return {
        ok: () => Number.isFinite(num(c, 'value')) && Math.abs(num(c, 'value')) <= 100000,
        reason: 'gold magnitude > 100000'
      }
    case 'xp':
      return { ok: () => inRange(num(c, 'value'), 0, 100000), reason: 'xp out of [0,100000]' }
    case 'add_exhaustion':
      return {
        ok: () => inRange(num(c, 'levels'), 1, 6) && isInt(num(c, 'levels')),
        reason: 'exhaustion levels out of [1,6] or non-integer'
      }
    case 'set_ability_score':
      return { ok: () => inRange(num(c, 'value'), 1, 30), reason: 'ability score out of [1,30]' }
    case 'hit_dice':
      return {
        ok: () => Number.isFinite(num(c, 'value')) && Math.abs(num(c, 'value')) <= 20,
        reason: 'hit_dice magnitude > 20'
      }
  }
  if (SLOT_TYPES.has(change.type)) {
    return {
      ok: () => {
        if (!inRange(num(c, 'level'), 1, 9) || !isInt(num(c, 'level'))) return false
        if (c.count !== undefined && (!inRange(num(c, 'count'), 1, 4) || !isInt(num(c, 'count')))) return false
        return true
      },
      reason: 'spell-slot level out of [1,9] / count out of [1,4] / non-integer'
    }
  }
  return null // types not listed pass through untouched
}

/** Reject changes whose referent is unknown or whose value is out of bounds. Types
 *  with no rule pass through (must never block exotic-but-legal tag-path changes). */
export function validateAgainstGameState(
  changes: StatChange[],
  snapshot: GameStateSnapshot
): { valid: StatChange[]; rejected: Array<{ change: StatChange; reason: string }> } {
  const valid: StatChange[] = []
  const rejected: Array<{ change: StatChange; reason: string }> = []

  for (const change of changes) {
    const c = change as unknown as Record<string, unknown>
    // Referents.
    if (
      typeof c.characterName === 'string' &&
      c.characterName !== '' &&
      !matches(c.characterName, snapshot.partyNames)
    ) {
      rejected.push({ change, reason: `unknown character "${c.characterName}"` })
      continue
    }
    if (typeof c.targetLabel === 'string' && c.targetLabel !== '' && !matches(c.targetLabel, snapshot.creatureLabels)) {
      rejected.push({ change, reason: `unknown creature "${c.targetLabel}"` })
      continue
    }
    // Bounds.
    const bc = boundCheck(change)
    if (bc && !bc.ok(c)) {
      rejected.push({ change, reason: bc.reason })
      continue
    }
    valid.push(change)
  }
  return { valid, rejected }
}

// ── Dedupe ──────────────────────────────────────────────────────────

/** Identity key for a change: key-sorted JSON, `reason` omitted (the model rephrases
 *  reasons; the mechanics are the duplicate), case-insensitive on referent/name. */
function identityKey(change: StatChange): string {
  const c = change as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(c).sort()) {
    if (k === 'reason') continue
    const v = c[k]
    out[k] =
      typeof v === 'string' && (k === 'characterName' || k === 'targetLabel' || k === 'name') ? v.toLowerCase() : v
  }
  return JSON.stringify(out)
}

/** Return `incoming` minus entries already present in `base` (by mechanics identity). */
export function dedupeStatChanges(base: StatChange[], incoming: StatChange[]): StatChange[] {
  const seen = new Set(base.map(identityKey))
  const out: StatChange[] = []
  for (const c of incoming) {
    const key = identityKey(c)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}
