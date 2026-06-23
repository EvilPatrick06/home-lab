/**
 * Browser-pure core of the AI stat-mutation pipeline.
 *
 * Holds the storage-agnostic apply logic — `validateChange`, `applyChange`, and
 * the batch helper `applyChangesToCharacter` — extracted from `stat-mutations.ts`
 * so BOTH targets can apply mechanics identically:
 *
 *   - desktop main process → `applyMutations` (loads/saves via file storage)
 *   - browser web build     → `window.api.ai.applyMutations` (loads/saves via IndexedDB)
 *
 * This module imports ONLY types and the browser-pure `./character-conditions`
 * helpers — no `node:fs`, no Electron, no file storage — so it is safe to pull
 * into the web bundle (mirrors how `ai-schemas.ts` is shared today).
 */
import type { Character5eV3, Feature } from '../../shared/types/character-5e'
import type { AbilityName } from '../../shared/types/character-common'
import {
  addConditionInstance,
  conditionSlug,
  getConditionValue,
  hasCondition,
  removeConditionInstance,
  setConditionValue
} from './character-conditions'
import type { MutationResult, StatChange } from './types'

/** Map the AI's abbreviated ability keys to the full names used in proficiencies.savingThrows. */
const ABILITY_FULL_NAME: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', AbilityName> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma'
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
export function validateChange(char: Character5eV3, change: StatChange): string | null {
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
export function applyChange(char: Character5eV3, change: StatChange): void {
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
 * Apply a batch of stat changes to an in-memory character, mutating it in place.
 *
 * Storage-agnostic: the caller loads the character, calls this, then persists the
 * mutated object when `applied` is non-empty. Each change is validated first;
 * invalid ones are collected in `rejected` and never applied. When anything was
 * applied, `char.updatedAt` is bumped so the save reflects the change.
 *
 * Shared by desktop `applyMutations` (file storage) and the web build
 * (`window.api.ai.applyMutations`, IndexedDB) so both apply mechanics identically.
 */
export function applyChangesToCharacter(char: Character5eV3, changes: StatChange[]): MutationResult {
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
  }

  return { applied, rejected }
}
