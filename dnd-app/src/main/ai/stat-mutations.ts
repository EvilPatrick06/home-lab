import type { Character5eV3, Feature } from '../../shared/types/character-5e'
import type { AbilityName } from '../../shared/types/character-common'
import { logToFile } from '../log'
import { loadCharacter, saveCharacter } from '../storage/character-storage'
import { repairJson, StatChangesBlockSchema, type ValidationIssue, validateStatChanges } from './ai-schemas'
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
    const repaired = repairJson(match[1])
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

interface SpellSlot {
  current: number
  max: number
}

/** Short-form ability key used by the `set_ability_score` AI mutation. */
type AbilityShort = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

// Phase 28d — persisted characters are still the v3 inline-array shape at runtime
// (CURRENT_SCHEMA_VERSION === 3; the v4 ref migration is dormant until v3.0.0), so
// these mutation functions type `char` as `Character5eV3` — the canonical type that
// carries the inline `conditions`/`weapons`/`armor` fields this logic reads and writes.
// Character5eV3 fields are mutable, so the apply step writes back in place without casts.

/** Find the spell slot record for a given level, checking both regular and Pact Magic slots. */
function findSlotRecord(char: Character5eV3, level: number): { slot: SpellSlot; isPact: boolean } | null {
  const regularSlots = char.spellSlotLevels
  if (regularSlots?.[level]) return { slot: regularSlots[level], isPact: false }
  const pactSlots = char.pactMagicSlotLevels
  if (pactSlots?.[level]) return { slot: pactSlots[level], isPact: true }
  return null
}

/** Validate a single change against a 5e character. */
function validateChange(char: Character5eV3, change: StatChange): string | null {
  switch (change.type) {
    case 'damage':
      return change.value <= 0 ? 'Damage must be positive' : null
    case 'heal':
      return change.value <= 0 ? 'Heal amount must be positive' : null
    case 'temp_hp':
      return change.value < 0 ? 'Temp HP must be non-negative' : null
    case 'add_condition': {
      const conditions = char.conditions || []
      return conditions.some((c) => c.name.toLowerCase() === change.name.toLowerCase())
        ? `Already has condition: ${change.name}`
        : null
    }
    case 'remove_condition': {
      const conditions = char.conditions || []
      return !conditions.some((c) => c.name.toLowerCase() === change.name.toLowerCase())
        ? `Does not have condition: ${change.name}`
        : null
    }
    case 'death_save':
    case 'reset_death_saves':
      return null
    case 'expend_spell_slot': {
      const record = findSlotRecord(char, change.level)
      if (!record) return `No spell slots at level ${change.level}`
      if (record.slot.current <= 0) return `No remaining spell slots at level ${change.level}`
      return null
    }
    case 'restore_spell_slot': {
      const record = findSlotRecord(char, change.level)
      return !record ? `No spell slots at level ${change.level}` : null
    }
    case 'add_item':
      return null
    case 'remove_item': {
      const equipment = char.equipment || []
      const item = equipment.find((e) => e.name.toLowerCase() === change.name.toLowerCase())
      if (!item) return `Item not found: ${change.name}`
      const qty = change.quantity ?? 1
      return item.quantity < qty ? `Not enough ${change.name} (have ${item.quantity}, need ${qty})` : null
    }
    case 'gold': {
      const denom = change.denomination ?? 'gp'
      const treasure = char.treasure
      const current = treasure?.[denom] ?? 0
      return current + change.value < 0 ? `Not enough ${denom} (have ${current}, need ${-change.value})` : null
    }
    case 'xp':
      return change.value <= 0 ? 'XP must be positive' : null
    case 'use_class_resource': {
      const resources = char.classResources
      const resource = resources?.find((r) => r.name.toLowerCase() === change.name.toLowerCase())
      if (!resource) return `Class resource not found: ${change.name}`
      const amount = change.amount ?? 1
      return resource.current < amount ? `Not enough ${change.name} (have ${resource.current})` : null
    }
    case 'restore_class_resource': {
      const resources = char.classResources
      return !resources?.find((r) => r.name.toLowerCase() === change.name.toLowerCase())
        ? `Class resource not found: ${change.name}`
        : null
    }
    case 'heroic_inspiration':
      return null
    case 'npc_attitude':
      return null // Informational only — logged in chat, not applied to character
    case 'hit_dice': {
      const hitDice = char.hitDice
      const remaining = hitDice ? hitDice.reduce((s, h) => s + h.current, 0) : char.level
      const max = hitDice ? hitDice.reduce((s, h) => s + h.maximum, 0) : char.level
      const newVal = remaining + change.value
      if (newVal < 0) return `Not enough hit dice (have ${remaining})`
      if (newVal > max) return `Hit dice cannot exceed maximum (${max})`
      return null
    }
    case 'creature_damage':
    case 'creature_heal':
    case 'creature_add_condition':
    case 'creature_remove_condition':
    case 'creature_kill':
    case 'creature_set_resistance':
    case 'creature_set_vulnerability':
    case 'creature_set_immunity':
    case 'creature_expend_spell_slot':
    case 'creature_restore_spell_slot':
      return null // Creature mutations pass through to renderer — validated there
    case 'set_ability_score': {
      const valid = ['str', 'dex', 'con', 'int', 'wis', 'cha']
      if (!valid.includes(change.ability)) return `Invalid ability score: ${change.ability}`
      if (change.value < 1 || change.value > 30) return `Ability score out of range (1-30): ${change.value}`
      return null
    }
    case 'grant_feature':
    case 'revoke_feature':
      return null
    case 'reduce_exhaustion': {
      const conditions = char.conditions || []
      return !conditions.some((c) => c.name.toLowerCase() === 'exhaustion') ? 'No exhaustion to reduce' : null
    }
    case 'add_exhaustion':
      return change.levels > 0 ? null : 'Exhaustion levels must be positive'
    default:
      return `Unknown change type: ${(change as { type: string }).type}`
  }
}

/** Apply a single mutation to the character object in place. */
function applyChange(char: Character5eV3, change: StatChange): void {
  switch (change.type) {
    case 'damage': {
      const hp = char.hitPoints
      let remaining = change.value
      if (hp.temporary > 0) {
        const absorbed = Math.min(hp.temporary, remaining)
        hp.temporary -= absorbed
        remaining -= absorbed
      }
      hp.current = Math.max(0, hp.current - remaining)
      break
    }
    case 'heal': {
      const hp = char.hitPoints
      const wasZero = hp.current === 0
      hp.current = Math.min(hp.maximum, hp.current + change.value)
      if (wasZero && hp.current > 0) {
        char.deathSaves = { successes: 0, failures: 0 }
      }
      break
    }
    case 'temp_hp': {
      const hp = char.hitPoints
      hp.temporary = Math.max(hp.temporary, change.value)
      break
    }
    case 'add_condition': {
      const conditions = char.conditions!
      conditions.push({
        name: change.name,
        type: 'condition',
        isCustom: false,
        ...(change.duration !== undefined ? { duration: change.duration } : {})
      })
      break
    }
    case 'remove_condition': {
      char.conditions = char.conditions!.filter((c) => c.name.toLowerCase() !== change.name.toLowerCase())
      break
    }
    case 'death_save': {
      const ds = char.deathSaves
      if (change.success) {
        ds.successes = Math.min(3, ds.successes + 1)
      } else {
        ds.failures = Math.min(3, ds.failures + 1)
      }
      break
    }
    case 'reset_death_saves': {
      char.deathSaves = { successes: 0, failures: 0 }
      break
    }
    case 'expend_spell_slot': {
      const record = findSlotRecord(char, change.level)!
      record.slot.current = Math.max(0, record.slot.current - 1)
      break
    }
    case 'restore_spell_slot': {
      const record = findSlotRecord(char, change.level)!
      const count = change.count ?? 1
      record.slot.current = Math.min(record.slot.max, record.slot.current + count)
      break
    }
    case 'add_item': {
      const equipment = char.equipment
      const existing = equipment.find((e) => e.name.toLowerCase() === change.name.toLowerCase())
      if (existing) {
        existing.quantity += change.quantity ?? 1
      } else {
        equipment.push({ name: change.name, quantity: change.quantity ?? 1, description: change.description })
      }
      break
    }
    case 'remove_item': {
      const equipment = char.equipment
      const item = equipment.find((e) => e.name.toLowerCase() === change.name.toLowerCase())
      if (item) {
        item.quantity -= change.quantity ?? 1
        if (item.quantity <= 0) {
          char.equipment = equipment.filter((e) => e.name.toLowerCase() !== change.name.toLowerCase())
        }
      }
      break
    }
    case 'gold': {
      const denom = change.denomination ?? 'gp'
      const treasure = char.treasure
      treasure[denom] = Math.max(0, (treasure[denom] ?? 0) + change.value)
      break
    }
    case 'xp': {
      char.xp = (char.xp || 0) + change.value
      break
    }
    case 'use_class_resource': {
      const resources = char.classResources!
      const resource = resources.find((r) => r.name.toLowerCase() === change.name.toLowerCase())!
      resource.current = Math.max(0, resource.current - (change.amount ?? 1))
      break
    }
    case 'restore_class_resource': {
      const resources = char.classResources!
      const resource = resources.find((r) => r.name.toLowerCase() === change.name.toLowerCase())!
      resource.current = Math.min(resource.max, resource.current + (change.amount ?? resource.max))
      break
    }
    case 'heroic_inspiration': {
      char.heroicInspiration = change.grant
      break
    }
    case 'npc_attitude': {
      // NPC attitude changes are informational — logged but not stored on character
      break
    }
    case 'hit_dice': {
      const hitDice = char.hitDice
      if (hitDice && hitDice.length > 0) {
        let delta = change.value
        if (delta > 0) {
          for (const hd of hitDice) {
            const add = Math.min(delta, hd.maximum - hd.current)
            hd.current += add
            delta -= add
            if (delta <= 0) break
          }
        } else {
          delta = -delta
          for (const hd of hitDice) {
            const take = Math.min(delta, hd.current)
            hd.current -= take
            delta -= take
            if (delta <= 0) break
          }
        }
      }
      break
    }
    case 'set_ability_score': {
      const abilityMap: Record<AbilityShort, AbilityName> = {
        str: 'strength',
        dex: 'dexterity',
        con: 'constitution',
        int: 'intelligence',
        wis: 'wisdom',
        cha: 'charisma'
      }
      const abilityScores = char.abilityScores
      const fullName = abilityMap[change.ability]
      if (fullName)
        abilityScores[fullName] = change.value
        // Also update short-form keys if a legacy character carries them. Short keys
        // (str/dex/…) aren't part of the canonical AbilityScoreSet, so this writes
        // through a record view of the same object — behavior preserved from the prior
        // `as Record<string, number>` cast.
      ;(abilityScores as unknown as Record<string, number>)[change.ability] = change.value
      break
    }
    case 'grant_feature': {
      // AI-DM-granted features carry a runtime `id` (for later removal by the sheet)
      // that the canonical `Feature` shape doesn't model, and `description` may be
      // absent at runtime. The persisted `features` array is structurally looser than
      // `Feature`; this narrows to that runtime shape so the id + optional description
      // ride along exactly as before (no JSON-shape change).
      const features = char.features as Array<Omit<Feature, 'description'> & { id?: string; description?: string }>
      features.push({
        id: crypto.randomUUID(),
        name: change.name,
        description: change.description,
        source: 'AI DM'
      })
      break
    }
    case 'revoke_feature': {
      const features = char.features
      const idx = features.findIndex((f) => f.name.toLowerCase() === change.name.toLowerCase())
      if (idx !== -1) features.splice(idx, 1)
      break
    }
    case 'reduce_exhaustion': {
      const conditions = char.conditions
      const exh = conditions?.find((c) => c.name.toLowerCase() === 'exhaustion')
      if (exh) {
        if (exh.value && exh.value > 1) {
          exh.value -= 1
        } else {
          char.conditions = conditions!.filter((c) => c !== exh)
        }
      }
      break
    }
    case 'add_exhaustion': {
      if (!char.conditions) char.conditions = []
      const conditions = char.conditions
      const exh = conditions.find((c) => c.name.toLowerCase() === 'exhaustion')
      // Exhaustion is a single condition with a numeric level (PHB caps at 6 = death).
      if (exh) {
        exh.value = Math.min(6, (exh.value ?? 1) + change.levels)
      } else {
        conditions.push({ name: 'Exhaustion', type: 'condition', isCustom: false, value: Math.min(6, change.levels) })
      }
      break
    }
    case 'creature_damage':
    case 'creature_heal':
    case 'creature_add_condition':
    case 'creature_remove_condition':
    case 'creature_kill':
    case 'creature_set_resistance':
    case 'creature_set_vulnerability':
    case 'creature_set_immunity':
    case 'creature_expend_spell_slot':
    case 'creature_restore_spell_slot':
      // Creature (non-character) mutations are applied renderer-side against token
      // state — there is no Character to mutate here. Intentional pass-through.
      break
    default: {
      // Exhaustiveness guard — a new StatChange member must add an arm above, or
      // this stops compiling, keeping the union reconciled with the executor.
      const _exhaustive: never = change
      void _exhaustive
    }
  }
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
  const applied: StatChange[] = []
  const rejected: Array<{ change: StatChange; reason: string }> = []

  for (const change of changes) {
    const error = validateChange(char, change)
    if (error) {
      rejected.push({ change, reason: error })
    } else {
      applyChange(char, change)
      applied.push(change)
    }
  }

  if (applied.length > 0) {
    char.updatedAt = new Date().toISOString()
    await saveCharacter(char as unknown as Record<string, unknown>)
  }

  return { applied, rejected }
}

/**
 * Apply a long rest to a character: restore all HP, all spell slots, all class resources,
 * restore half total hit dice (min 1), and clear temporary HP.
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
    // Clear temp HP
    if (hp.temporary > 0) {
      hp.temporary = 0
    }
  }

  // Restore all spell slots to max
  const regularSlots = char.spellSlotLevels
  if (regularSlots) {
    for (const [levelStr, slot] of Object.entries(regularSlots)) {
      const level = Number(levelStr)
      if (!Number.isNaN(level) && slot.current < slot.max) {
        changes.push({ type: 'restore_spell_slot', level, count: slot.max - slot.current, reason: 'long rest' })
      }
    }
  }

  // Pact Magic slots also restore on long rest (in addition to short rest)
  const pactSlots = char.pactMagicSlotLevels
  if (pactSlots) {
    for (const [levelStr, slot] of Object.entries(pactSlots)) {
      const level = Number(levelStr)
      if (!Number.isNaN(level) && slot.current < slot.max) {
        changes.push({ type: 'restore_spell_slot', level, count: slot.max - slot.current, reason: 'long rest' })
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

  // Restore half total hit dice (min 1)
  const hitDice = char.hitDice
  if (hitDice && hitDice.length > 0) {
    const totalMax = hitDice.reduce((s, h) => s + h.maximum, 0)
    const totalCurrent = hitDice.reduce((s, h) => s + h.current, 0)
    const restore = Math.max(1, Math.floor(totalMax / 2))
    const canRestore = Math.min(restore, totalMax - totalCurrent)
    if (canRestore > 0) {
      changes.push({ type: 'hit_dice', value: canRestore, reason: 'long rest' })
    }
  }

  // PHB 2024: Long rest reduces Exhaustion by 1 level
  const conditions = char.conditions
  const exhaustion = conditions?.find((c) => c.name.toLowerCase() === 'exhaustion')
  if (exhaustion) {
    changes.push({ type: 'reduce_exhaustion', reason: 'long rest' })
  }

  if (changes.length === 0) {
    return { applied: [], rejected: [] }
  }

  // Apply all changes at once
  const applied: StatChange[] = []
  const rejected: Array<{ change: StatChange; reason: string }> = []
  for (const change of changes) {
    const error = validateChange(char, change)
    if (error) {
      rejected.push({ change, reason: error })
    } else {
      applyChange(char, change)
      applied.push(change)
    }
  }

  if (applied.length > 0) {
    char.updatedAt = new Date().toISOString()
    await saveCharacter(char as unknown as Record<string, unknown>)
  }
  return { applied, rejected }
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
        changes.push({ type: 'restore_spell_slot', level, count: slot.max - slot.current, reason: 'short rest' })
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

  const applied: StatChange[] = []
  const rejected: Array<{ change: StatChange; reason: string }> = []
  for (const change of changes) {
    const error = validateChange(char, change)
    if (error) {
      rejected.push({ change, reason: error })
    } else {
      applyChange(char, change)
      applied.push(change)
    }
  }

  if (applied.length > 0) {
    char.updatedAt = new Date().toISOString()
    await saveCharacter(char as unknown as Record<string, unknown>)
  }
  return { applied, rejected }
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
    case 'add_condition':
      return `Condition gained: ${change.name} (${change.reason})`
    case 'remove_condition':
      return `Condition removed: ${change.name} (${change.reason})`
    case 'death_save':
      return `Death save ${change.success ? 'success' : 'failure'} (${change.reason})`
    case 'reset_death_saves':
      return `Death saves reset (${change.reason})`
    case 'expend_spell_slot':
      return `Spell slot (level ${change.level}) expended (${change.reason})`
    case 'restore_spell_slot':
      return `Spell slot (level ${change.level}) restored (${change.reason})`
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
