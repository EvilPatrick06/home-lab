import type { Character5eV3 } from '../../shared/types/character-5e'
import { logToFile } from '../log'
import { loadCharacter, saveCharacter } from '../storage/character-storage'
import { repairJsonDetailed, StatChangesBlockSchema, type ValidationIssue, validateStatChanges } from './ai-schemas'
import { hasCondition } from './character-conditions'
// The storage-agnostic apply logic lives in `./stat-mutations-core` (browser-pure)
// so the web build can apply mechanics identically; this module keeps the
// file-storage wrappers + the parse/describe helpers.
import { applyChangesToCharacter } from './stat-mutations-core'
import type { MutationResult, StatChange } from './types'

export interface StatChangeParseResult {
  changes: StatChange[]
  issues: ValidationIssue[]
  rawJsonError?: string
}

/** Extract and validate stat changes JSON from AI response text. */
export function parseStatChanges(response: string): StatChange[] {
  return parseStatChangesDetailed(response).changes
}

/** PHASE-23 23E: an unclosed `[STAT_CHANGES]` opener (no matching close tag) never
 *  matches the block regex, so its mechanics are silently lost (F1). A signal that
 *  structured extraction should run in `fallback` mode. */
export function hasOrphanStatChangesTag(text: string): boolean {
  return /\[STAT_CHANGES\]/.test(text) && !/\[STAT_CHANGES\][\s\S]*?\[\/STAT_CHANGES\]/.test(text)
}

/**
 * Extract, repair, and schema-validate stat changes from AI response text.
 * Returns both valid changes and detailed validation issues for logging.
 */
export function parseStatChangesDetailed(response: string): StatChangeParseResult {
  // Parse EVERY [STAT_CHANGES] block (the strip removes them all) so a second
  // block's changes aren't silently dropped + hidden.
  const blocks = [...response.matchAll(/\[STAT_CHANGES\]\s*([\s\S]*?)\s*\[\/STAT_CHANGES\]/g)]
  if (blocks.length === 0) return { changes: [], issues: [] }

  const allValid: StatChange[] = []
  const allIssues: ValidationIssue[] = []
  let rawJsonError: string | undefined

  for (const match of blocks) {
    const { repaired, modified } = repairJsonDetailed(match[1])
    if (modified) logToFile('INFO', '[AI Schema] repairJson modified a [STAT_CHANGES] block')
    try {
      const parsed = JSON.parse(repaired)
      const block = StatChangesBlockSchema.safeParse(parsed)
      if (!block.success) {
        rawJsonError = `[STAT_CHANGES] block missing "changes" array: ${block.error.issues.map((i) => i.message).join(', ')}`
        logToFile('WARN', `[AI Schema] ${rawJsonError}`)
        continue
      }
      const { valid, issues } = validateStatChanges(block.data.changes)
      for (const issue of issues) {
        logToFile(
          'WARN',
          `[AI Schema] Stat change [${issue.index}] rejected: ${issue.errors.join('; ')} — input: ${JSON.stringify(issue.input).slice(0, 200)}`
        )
      }
      allValid.push(...(valid as StatChange[]))
      allIssues.push(...issues)
    } catch (e) {
      rawJsonError = `[STAT_CHANGES] JSON parse failed: ${e instanceof Error ? e.message : String(e)}`
      logToFile('WARN', `[AI Schema] ${rawJsonError}`)
    }
  }

  return { changes: allValid, issues: allIssues, rawJsonError }
}

/** Remove the [STAT_CHANGES] block from response text for display. */
export function stripStatChanges(response: string): string {
  return response.replace(/\s*\[STAT_CHANGES\][\s\S]*?\[\/STAT_CHANGES\]\s*/g, '').trim()
}

/**
 * Apply stat mutations to a character, persisting to storage.
 */
export async function applyMutations(characterId: string, changes: StatChange[]): Promise<MutationResult> {
  const result = await loadCharacter(characterId)
  if (!result.success || !result.data) {
    return { applied: [], rejected: changes.map((c) => ({ change: c, reason: 'Character not found' })) }
  }

  // One narrowing at the opaque-storage boundary: storage returns persisted JSON
  // typed as `Record<string, unknown>`, which at runtime is the v3 character shape.
  const char = result.data as unknown as Character5eV3
  const out = applyChangesToCharacter(char, changes)

  if (out.applied.length > 0) {
    await saveCharacter(char as unknown as Record<string, unknown>)
  }

  return out
}

/**
 * Apply a long rest to a character: restore all HP, all spell slots, all class resources,
 * restore ALL spent hit dice (PHB 2024), and clear temporary HP.
 */
export async function applyLongRestMutations(characterId: string): Promise<MutationResult> {
  const result = await loadCharacter(characterId)
  if (!result.success || !result.data) {
    return {
      applied: [],
      rejected: [{ change: { type: 'reset_death_saves', reason: 'long rest' }, reason: 'Character not found' }]
    }
  }

  // One narrowing at the opaque-storage boundary (see applyMutations).
  const char = result.data as unknown as Character5eV3
  const changes: StatChange[] = []

  // Restore HP to max and clear temp HP
  const hp = char.hitPoints
  if (hp) {
    if (hp.current < hp.maximum) {
      changes.push({ type: 'heal', value: hp.maximum - hp.current, reason: 'long rest' })
    }
    // Clear temp HP through the changes pipeline so it's reported in applied[] and
    // saved (was a direct mutation that the save gate could discard — PHASE-02 02E).
    if (hp.temporary > 0) {
      changes.push({ type: 'clear_temp_hp', reason: 'long rest' })
    }
  }

  // Restore all spell slots to max
  const regularSlots = char.spellSlotLevels
  if (regularSlots) {
    for (const [levelStr, slot] of Object.entries(regularSlots)) {
      const level = Number(levelStr)
      if (!Number.isNaN(level) && slot.current < slot.max) {
        changes.push({
          type: 'restore_spell_slot',
          level,
          count: slot.max - slot.current,
          pool: 'regular',
          reason: 'long rest'
        })
      }
    }
  }

  // Pact Magic slots also restore on long rest (in addition to short rest)
  const pactSlots = char.pactMagicSlotLevels
  if (pactSlots) {
    for (const [levelStr, slot] of Object.entries(pactSlots)) {
      const level = Number(levelStr)
      if (!Number.isNaN(level) && slot.current < slot.max) {
        changes.push({
          type: 'restore_spell_slot',
          level,
          count: slot.max - slot.current,
          pool: 'pact',
          reason: 'long rest'
        })
      }
    }
  }

  // Restore all class resources
  const resources = char.classResources
  if (resources) {
    for (const resource of resources) {
      if (resource.current < resource.max) {
        changes.push({ type: 'restore_class_resource', name: resource.name, reason: 'long rest' })
      }
    }
  }

  // PHB 2024: a long rest restores ALL spent Hit Point Dice (2014 restored half).
  const hitDice = char.hitDice
  if (hitDice && hitDice.length > 0) {
    const totalMax = hitDice.reduce((s, h) => s + h.maximum, 0)
    const totalCurrent = hitDice.reduce((s, h) => s + h.current, 0)
    const canRestore = totalMax - totalCurrent
    if (canRestore > 0) {
      changes.push({ type: 'hit_dice', value: canRestore, reason: 'long rest' })
    }
  }

  // PHB 2024: Long rest reduces Exhaustion by 1 level (probe via the v4 helper —
  // the inline conditions array is stripped on v4 records; PHASE-02 02B/02E).
  if (hasCondition(char, 'exhaustion')) {
    changes.push({ type: 'reduce_exhaustion', reason: 'long rest' })
  }

  if (changes.length === 0) {
    return { applied: [], rejected: [] }
  }

  // Apply all changes at once
  const out = applyChangesToCharacter(char, changes)
  if (out.applied.length > 0) {
    await saveCharacter(char as unknown as Record<string, unknown>)
  }
  return out
}

/**
 * Apply a short rest to a character: restore Warlock Pact Magic slots and short-rest class resources.
 * Hit dice spending is handled by the player via the character sheet — we don't auto-spend them.
 */
export async function applyShortRestMutations(characterId: string): Promise<MutationResult> {
  const result = await loadCharacter(characterId)
  if (!result.success || !result.data) {
    return { applied: [], rejected: [] }
  }

  // One narrowing at the opaque-storage boundary (see applyMutations).
  const char = result.data as unknown as Character5eV3
  const changes: StatChange[] = []

  // Restore Pact Magic slots to max (Warlock short rest recovery)
  const pactSlots = char.pactMagicSlotLevels
  if (pactSlots) {
    for (const [levelStr, slot] of Object.entries(pactSlots)) {
      const level = Number(levelStr)
      if (!Number.isNaN(level) && slot.current < slot.max) {
        changes.push({
          type: 'restore_spell_slot',
          level,
          count: slot.max - slot.current,
          pool: 'pact',
          reason: 'short rest'
        })
      }
    }
  }

  // Restore short-rest class resources. A resource recharges on a short rest
  // when `shortRestRestore !== 0` (mirrors rest-service-5e.ts, the canonical
  // renderer rest path). `'all'` restores to max (no amount → applyChange caps
  // at max); a number restores that many, capped at max. (28d: the old branch
  // gated on a non-existent `recharge === 'short'` field and never fired.)
  const resources = char.classResources
  if (resources) {
    for (const resource of resources) {
      if (resource.shortRestRestore !== 0 && resource.current < resource.max) {
        changes.push({
          type: 'restore_class_resource',
          name: resource.name,
          amount: resource.shortRestRestore === 'all' ? undefined : resource.shortRestRestore,
          reason: 'short rest'
        })
      }
    }
  }

  if (changes.length === 0) {
    return { applied: [], rejected: [] }
  }

  const out = applyChangesToCharacter(char, changes)
  if (out.applied.length > 0) {
    await saveCharacter(char as unknown as Record<string, unknown>)
  }
  return out
}

/** Describe a stat change in human-readable text. */
export function describeChange(change: StatChange): string {
  switch (change.type) {
    case 'damage':
      return `${change.value} ${change.damageType ?? ''} damage (${change.reason})`
    case 'heal':
      return `Healed ${change.value} HP (${change.reason})`
    case 'temp_hp':
      return `${change.value} temporary HP (${change.reason})`
    case 'clear_temp_hp':
      return `Temporary HP cleared (${change.reason})`
    case 'add_condition':
      return `Condition gained: ${change.name} (${change.reason})`
    case 'remove_condition':
      return `Condition removed: ${change.name} (${change.reason})`
    case 'death_save':
      return `Death save ${change.success ? 'success' : 'failure'} (${change.reason})`
    case 'reset_death_saves':
      return `Death saves reset (${change.reason})`
    case 'expend_spell_slot':
      return `Spell slot (level ${change.level}${change.pool === 'pact' ? ', pact' : ''}) expended (${change.reason})`
    case 'restore_spell_slot':
      return `Spell slot (level ${change.level}${change.pool === 'pact' ? ', pact' : ''}) restored (${change.reason})`
    case 'add_item':
      return `Gained: ${change.name}${change.quantity && change.quantity > 1 ? ` x${change.quantity}` : ''}`
    case 'remove_item':
      return `Lost: ${change.name}${change.quantity && change.quantity > 1 ? ` x${change.quantity}` : ''}`
    case 'gold':
      return `${change.value >= 0 ? '+' : ''}${change.value} ${change.denomination ?? 'gp'}`
    case 'xp':
      return `+${change.value} XP`
    case 'use_class_resource':
      return `${change.name} used`
    case 'restore_class_resource':
      return `${change.name} restored`
    case 'heroic_inspiration':
      return `Heroic Inspiration ${change.grant ? 'granted' : 'used'}`
    case 'hit_dice':
      return `Hit dice ${change.value >= 0 ? '+' : ''}${change.value}`
    case 'npc_attitude':
      return `${change.name} is now ${change.attitude} (${change.reason})`
    case 'creature_damage':
      return `${change.targetLabel}: ${change.value} ${change.damageType ?? ''} damage (${change.reason})`
    case 'creature_heal':
      return `${change.targetLabel}: healed ${change.value} HP (${change.reason})`
    case 'creature_add_condition':
      return `${change.targetLabel}: gained ${change.name} (${change.reason})`
    case 'creature_remove_condition':
      return `${change.targetLabel}: lost ${change.name} (${change.reason})`
    case 'creature_kill':
      return `${change.targetLabel}: killed (${change.reason})`
    case 'creature_set_resistance':
      return `${change.targetLabel}: ${change.replace ? 'resistances set to' : 'resistant to'} ${change.damageTypes.join(', ')} (${change.reason})`
    case 'creature_set_vulnerability':
      return `${change.targetLabel}: ${change.replace ? 'vulnerabilities set to' : 'vulnerable to'} ${change.damageTypes.join(', ')} (${change.reason})`
    case 'creature_set_immunity':
      return `${change.targetLabel}: ${change.replace ? 'immunities set to' : 'immune to'} ${change.damageTypes.join(', ')} (${change.reason})`
    case 'creature_expend_spell_slot':
      return `${change.targetLabel}: expends ${change.count ?? 1} level-${change.level} spell slot(s) (${change.reason})`
    case 'creature_restore_spell_slot':
      return `${change.targetLabel}: restores ${change.count ?? 1} level-${change.level} spell slot(s) (${change.reason})`
    case 'set_ability_score':
      return `${change.ability.toUpperCase()} set to ${change.value} (${change.reason})`
    case 'grant_feature':
      return `Feature granted: ${change.name} (${change.reason})`
    case 'revoke_feature':
      return `Feature revoked: ${change.name} (${change.reason})`
    case 'reduce_exhaustion':
      return `Exhaustion reduced (${change.reason})`
    case 'add_exhaustion':
      return `Exhaustion +${change.levels} (${change.reason})`
    case 'set_equipped':
      return `${change.name} ${change.equipped ? 'equipped' : 'unequipped'} (${change.reason})`
    case 'set_proficiency':
      return `${change.category} proficiency in ${change.name} ${change.proficient ? 'granted' : 'removed'} (${change.reason})`
    case 'set_skill_proficiency':
      return `${change.skill}: ${change.proficient ? (change.expertise ? 'expertise' : 'proficient') : 'not proficient'} (${change.reason})`
    case 'set_save_proficiency':
      return `${change.ability.toUpperCase()} save proficiency ${change.proficient ? 'granted' : 'removed'} (${change.reason})`
    default: {
      // Exhaustiveness guard — every StatChange member must have an arm above;
      // the cast keeps a safe runtime fallback if one is ever missed.
      const _exhaustive: never = change
      return `${(_exhaustive as { type: string }).type} change`
    }
  }
}

/** Check if a stat change is negative (damage, resource spend, etc.) */
export function isNegativeChange(change: StatChange): boolean {
  return (
    change.type === 'damage' ||
    change.type === 'add_condition' ||
    (change.type === 'death_save' && !change.success) ||
    change.type === 'expend_spell_slot' ||
    change.type === 'use_class_resource' ||
    change.type === 'remove_item' ||
    (change.type === 'gold' && change.value < 0) ||
    (change.type === 'hit_dice' && change.value < 0) ||
    (change.type === 'npc_attitude' && change.attitude === 'hostile') ||
    change.type === 'creature_damage' ||
    change.type === 'creature_add_condition' ||
    change.type === 'creature_kill'
  )
}
