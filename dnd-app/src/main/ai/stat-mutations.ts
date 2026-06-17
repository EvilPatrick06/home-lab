import type { Character5eV3, Feature } from '../../shared/types/character-5e'
import type { AbilityName } from '../../shared/types/character-common'
import { logToFile } from '../log'
import { loadCharacter, saveCharacter } from '../storage/character-storage'
import { repairJsonDetailed, StatChangesBlockSchema, type ValidationIssue, validateStatChanges } from './ai-schemas'
import {
  addConditionInstance,
  conditionSlug,
  getConditionValue,
  hasCondition,
  removeConditionInstance,
  setConditionValue
} from './character-conditions'
import type { MutationResult, StatChange } from './types'

export interface StatChangeParseResult {
  changes: StatChange[]
  issues: ValidationIssue[]
  rawJsonError?: string
}

/** Map the AI's abbreviated ability keys to the full names used in proficiencies.savingThrows. */
const ABILITY_FULL_NAME: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', AbilityName> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma'
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

interface SpellSlot {
  current: number
  max: number
}

/** Short-form ability key used by the `set_ability_score` AI mutation. */
type AbilityShort = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

// PHASE-02 — persisted characters are v4 (CURRENT_SCHEMA_VERSION = 4). The inline
// v3 `conditions`/`weapons`/`armor` arrays are stripped on load/save, so conditions
// go through the v4 helpers in ./character-conditions (conditionRefs + overrides)
// and equipped state through `state.weaponEquipped`/`state.armorEquipped`. The
// remaining inline reads (`equipment`, `treasure`, `classResources`, `hitDice`,
// `skills`, `proficiencies`, `features`, slot pools) ARE canonical v4 fields.
// `char` is typed `Character5eV3` (a superset carrying both shapes); fields are
// mutable so the apply step writes back in place.

/** Resolve the spell-slot record for a level, honoring an explicit `pool` and
 *  (when omitted) the caller's intent so the regular and Pact Magic pools never
 *  alias. PHASE-02 02D. */
function resolveSlotRecord(
  char: Character5eV3,
  level: number,
  pool: 'regular' | 'pact' | undefined,
  intent: 'expend' | 'restore'
): { slot: SpellSlot; isPact: boolean } | null {
  const regular = char.spellSlotLevels?.[level]
  const pact = char.pactMagicSlotLevels?.[level]
  if (pool === 'regular') return regular ? { slot: regular, isPact: false } : null
  if (pool === 'pact') return pact ? { slot: pact, isPact: true } : null
  // No pool given — pick by intent so we act on the pool that actually has work.
  if (intent === 'expend') {
    if (regular && regular.current > 0) return { slot: regular, isPact: false }
    if (pact && pact.current > 0) return { slot: pact, isPact: true }
  } else {
    if (regular && regular.current < regular.max) return { slot: regular, isPact: false }
    if (pact && pact.current < pact.max) return { slot: pact, isPact: true }
  }
  // Nothing actionable — return a real record (regular first) so error strings cite one.
  if (regular) return { slot: regular, isPact: false }
  if (pact) return { slot: pact, isPact: true }
  return null
}

/** v4 weapon/armor ref instances whose name (overrides.name, else slugged entryId)
 *  matches `name` (case-insensitive). Used by set_equipped to toggle the v4
 *  `state.weaponEquipped`/`state.armorEquipped` maps (the inline `weapons`/`armor`
 *  arrays are stripped on v4 records). PHASE-02 02B. */
function matchEquippableRefs(
  char: Character5eV3,
  name: string
): Array<{ instanceId: string; kind: 'weapon' | 'armor' }> {
  const lower = name.toLowerCase()
  const slug = conditionSlug(name) // same lowercase+hyphen transform
  const out: Array<{ instanceId: string; kind: 'weapon' | 'armor' }> = []
  const scan = (
    list: Array<{ instanceId: string; ref: { entryId: string; overrides?: { name?: string } } }> | undefined,
    kind: 'weapon' | 'armor'
  ): void => {
    for (const r of list ?? []) {
      const refName = r.ref.overrides?.name?.toLowerCase()
      if (refName === lower || r.ref.entryId === slug) out.push({ instanceId: r.instanceId, kind })
    }
  }
  scan((char as unknown as { weaponRefs?: never[] }).weaponRefs, 'weapon')
  scan((char as unknown as { armorRefs?: never[] }).armorRefs, 'armor')
  return out
}

/** Validate a single change against a 5e character. */
function validateChange(char: Character5eV3, change: StatChange): string | null {
  switch (change.type) {
    case 'damage':
      return !Number.isFinite(change.value) || change.value <= 0 ? 'Damage must be a positive number' : null
    case 'heal':
      return !Number.isFinite(change.value) || change.value <= 0 ? 'Heal amount must be a positive number' : null
    case 'temp_hp':
      return !Number.isFinite(change.value) || change.value < 0 ? 'Temp HP must be a non-negative number' : null
    case 'add_condition':
      if (
        change.duration !== undefined &&
        typeof change.duration === 'number' &&
        (!Number.isInteger(change.duration) || change.duration < 1)
      )
        return 'Condition duration must be a positive integer'
      return hasCondition(char, change.name) ? `Already has condition: ${change.name}` : null
    case 'remove_condition':
      return !hasCondition(char, change.name) ? `Does not have condition: ${change.name}` : null
    case 'death_save':
    case 'reset_death_saves':
    case 'clear_temp_hp':
      return null
    case 'expend_spell_slot': {
      if (!Number.isInteger(change.level) || change.level < 1 || change.level > 9)
        return 'Spell slot level must be an integer 1-9'
      const poolLabel = change.pool === 'pact' ? 'pact spell slots' : 'spell slots'
      const record = resolveSlotRecord(char, change.level, change.pool, 'expend')
      if (!record) return `No ${poolLabel} at level ${change.level}`
      if (record.slot.current <= 0) return `No remaining ${poolLabel} at level ${change.level}`
      return null
    }
    case 'restore_spell_slot': {
      if (!Number.isInteger(change.level) || change.level < 1 || change.level > 9)
        return 'Spell slot level must be an integer 1-9'
      if (change.count !== undefined && (!Number.isInteger(change.count) || change.count < 1))
        return 'Spell slot count must be a positive integer'
      const poolLabel = change.pool === 'pact' ? 'pact spell slots' : 'spell slots'
      const record = resolveSlotRecord(char, change.level, change.pool, 'restore')
      return !record ? `No ${poolLabel} at level ${change.level}` : null
    }
    case 'add_item':
      return change.quantity !== undefined && (!Number.isInteger(change.quantity) || change.quantity < 1)
        ? 'Item quantity must be a positive integer'
        : null
    case 'remove_item': {
      if (change.quantity !== undefined && (!Number.isInteger(change.quantity) || change.quantity < 1))
        return 'Item quantity must be a positive integer'
      const equipment = char.equipment || []
      const item = equipment.find((e) => e.name.toLowerCase() === change.name.toLowerCase())
      if (!item) return `Item not found: ${change.name}`
      const qty = change.quantity ?? 1
      return item.quantity < qty ? `Not enough ${change.name} (have ${item.quantity}, need ${qty})` : null
    }
    case 'gold': {
      if (!Number.isFinite(change.value)) return 'Gold amount must be a number'
      const denom = change.denomination ?? 'gp'
      const treasure = char.treasure
      const current = treasure?.[denom] ?? 0
      return current + change.value < 0 ? `Not enough ${denom} (have ${current}, need ${-change.value})` : null
    }
    case 'xp':
      return !Number.isFinite(change.value) || change.value <= 0 ? 'XP must be a positive number' : null
    case 'use_class_resource': {
      const amount = change.amount ?? 1
      if (!Number.isInteger(amount) || amount < 1) return 'Resource amount must be a positive integer'
      const resources = char.classResources
      const resource = resources?.find((r) => r.name.toLowerCase() === change.name.toLowerCase())
      if (!resource) return `Class resource not found: ${change.name}`
      return resource.current < amount ? `Not enough ${change.name} (have ${resource.current})` : null
    }
    case 'restore_class_resource': {
      if (change.amount !== undefined && (!Number.isInteger(change.amount) || change.amount < 1))
        return 'Resource amount must be a positive integer'
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
      if (!Number.isInteger(change.value)) return 'Hit dice change must be an integer'
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
      if (!Number.isInteger(change.value)) return 'Ability score must be an integer'
      if (change.value < 1 || change.value > 30) return `Ability score out of range (1-30): ${change.value}`
      return null
    }
    case 'grant_feature':
    case 'revoke_feature':
      return null
    case 'reduce_exhaustion':
      return !hasCondition(char, 'exhaustion') ? 'No exhaustion to reduce' : null
    case 'add_exhaustion':
      return !Number.isInteger(change.levels) || change.levels <= 0
        ? 'Exhaustion levels must be a positive integer'
        : null
    case 'set_equipped': {
      const lower = change.name.toLowerCase()
      const inArray = (arr?: Array<{ name: string }>) => (arr ?? []).some((i) => i.name.toLowerCase() === lower)
      // v4: weapons/armor live as refs (inline arrays stripped); legacy inline
      // equipment/armor/weapons kept as a fallback for un-migrated records.
      return matchEquippableRefs(char, change.name).length > 0 ||
        inArray(char.equipment) ||
        inArray(char.armor) ||
        inArray(char.weapons)
        ? null
        : `No item named "${change.name}" to equip/unequip`
    }
    case 'set_skill_proficiency':
      return (char.skills ?? []).some((s) => s.name.toLowerCase() === change.skill.toLowerCase())
        ? null
        : `Skill "${change.skill}" not found on this character`
    case 'set_proficiency':
    case 'set_save_proficiency':
      return null
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
      addConditionInstance(char, {
        name: change.name,
        ...(change.duration !== undefined ? { duration: change.duration } : {})
      })
      break
    }
    case 'remove_condition': {
      removeConditionInstance(char, change.name)
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
    case 'clear_temp_hp': {
      char.hitPoints.temporary = 0
      break
    }
    case 'reset_death_saves': {
      char.deathSaves = { successes: 0, failures: 0 }
      break
    }
    case 'expend_spell_slot': {
      const record = resolveSlotRecord(char, change.level, change.pool, 'expend')!
      record.slot.current = Math.max(0, record.slot.current - 1)
      break
    }
    case 'restore_spell_slot': {
      const record = resolveSlotRecord(char, change.level, change.pool, 'restore')!
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
      const level = getConditionValue(char, 'exhaustion') ?? 1
      setConditionValue(char, 'exhaustion', level - 1)
      break
    }
    case 'add_exhaustion': {
      // Exhaustion is a single condition with a numeric level (PHB caps at 6 = death).
      const current = getConditionValue(char, 'exhaustion') ?? (hasCondition(char, 'exhaustion') ? 1 : 0)
      setConditionValue(char, 'exhaustion', Math.min(6, current + change.levels))
      break
    }
    case 'set_equipped': {
      const lower = change.name.toLowerCase()
      // v4: toggle equipped state in state.weaponEquipped / state.armorEquipped,
      // keyed by the matching ref's instanceId.
      const matches = matchEquippableRefs(char, change.name)
      if (matches.length > 0) {
        const state = ((char as unknown as { state?: Record<string, Record<string, boolean>> }).state ??= {})
        for (const m of matches) {
          const mapKey = m.kind === 'weapon' ? 'weaponEquipped' : 'armorEquipped'
          ;(state[mapKey] ??= {})[m.instanceId] = change.equipped
        }
      }
      // Legacy inline fallback: the same name can appear in equipment/armor/weapons.
      for (const arr of [char.equipment, char.armor, char.weapons]) {
        for (const item of arr ?? []) {
          if (item.name.toLowerCase() === lower) (item as { equipped?: boolean }).equipped = change.equipped
        }
      }
      break
    }
    case 'set_proficiency': {
      const field = ({ weapon: 'weapons', armor: 'armor', tool: 'tools', language: 'languages' } as const)[
        change.category
      ]
      if (!char.proficiencies) break
      const list = char.proficiencies[field] as string[]
      const idx = list.findIndex((p) => p.toLowerCase() === change.name.toLowerCase())
      if (change.proficient && idx < 0) list.push(change.name)
      else if (!change.proficient && idx >= 0) list.splice(idx, 1)
      break
    }
    case 'set_skill_proficiency': {
      const skill = (char.skills ?? []).find((s) => s.name.toLowerCase() === change.skill.toLowerCase())
      if (skill) {
        skill.proficient = change.proficient
        if (change.expertise !== undefined) skill.expertise = change.expertise
        // Losing proficiency drops expertise too (you can't have expertise without proficiency).
        if (!change.proficient) skill.expertise = false
      }
      break
    }
    case 'set_save_proficiency': {
      const fullName = ABILITY_FULL_NAME[change.ability]
      if (!char.proficiencies) break
      const saves = char.proficiencies.savingThrows
      const idx = saves.indexOf(fullName)
      if (change.proficient && idx < 0) saves.push(fullName)
      else if (!change.proficient && idx >= 0) saves.splice(idx, 1)
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
