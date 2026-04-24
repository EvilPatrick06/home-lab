import type { MagicItemEntry5e, SpellcastingInfo5e } from '../../types/character-5e'
import type { AbilityName, AbilityScoreSet, SpellEntry } from '../../types/character-common'
import { abilityModifier } from '../../types/character-common'
import type {
  HigherLevelCasting,
  HigherLevelScalingEntry,
  SpellAction,
  SpellComponents,
  SpellD20Modifier,
  SpellDamageData,
  SpellDuration,
  SpellHealingData,
  SpellRange
} from '../../types/data/spell-data-types'
import { logger } from '../../utils/logger'
import { load5eSpellSlots, load5eSpells } from '../data-provider'

// Re-export structured spell types for consumers that access them through spell-data
export type {
  SpellAction,
  SpellRange,
  SpellComponents,
  SpellDuration,
  SpellDamageData,
  SpellHealingData,
  SpellD20Modifier,
  HigherLevelScalingEntry,
  HigherLevelCasting
}

// Module-level caches (populated from spell-slots.json)
let _loaded = false

// Spellcasting ability by class
export const SPELLCASTING_ABILITY_MAP: Record<string, AbilityName> = {
  bard: 'charisma',
  cleric: 'wisdom',
  druid: 'wisdom',
  paladin: 'charisma',
  ranger: 'wisdom',
  sorcerer: 'charisma',
  warlock: 'charisma',
  wizard: 'intelligence'
}

// Third-caster subclass spellcasting abilities
const THIRD_CASTER_ABILITY_MAP: Record<string, AbilityName> = {
  'eldritch-knight': 'intelligence',
  'arcane-trickster': 'intelligence'
}

// Spell slot progression tables (loaded from JSON, initialized with defaults)
export let WARLOCK_PACT_SLOTS: Record<number, Record<number, number>> = {
  1: { 1: 1 },
  2: { 1: 2 },
  3: { 2: 2 },
  4: { 2: 2 },
  5: { 3: 2 },
  6: { 3: 2 },
  7: { 4: 2 },
  8: { 4: 2 },
  9: { 5: 2 },
  10: { 5: 2 },
  11: { 5: 3 },
  12: { 5: 3 },
  13: { 5: 3 },
  14: { 5: 3 },
  15: { 5: 3 },
  16: { 5: 3 },
  17: { 5: 4 },
  18: { 5: 4 },
  19: { 5: 4 },
  20: { 5: 4 }
}

export let FULL_CASTER_SLOTS: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 }
}

// Cantrips known for 5e casters
export let CANTRIPS_KNOWN: Record<string, Record<number, number>> = {
  bard: { 1: 2, 4: 3, 10: 4 },
  cleric: { 1: 3, 4: 4, 10: 5 },
  druid: { 1: 2, 4: 3, 10: 4 },
  sorcerer: { 1: 4, 4: 5, 10: 6 },
  warlock: { 1: 2, 4: 3, 10: 4 },
  wizard: { 1: 3, 4: 4, 10: 5 }
}

export const FULL_CASTERS_5E = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard']
export const HALF_CASTERS_5E = ['paladin', 'ranger']

// Prepared spells tables for all caster classes (2024 PHB)
export let PREPARED_SPELLS: Record<string, Record<number, number>> = {
  bard: {
    1: 4,
    2: 5,
    3: 6,
    4: 7,
    5: 9,
    6: 10,
    7: 11,
    8: 12,
    9: 14,
    10: 15,
    11: 16,
    12: 16,
    13: 17,
    14: 17,
    15: 18,
    16: 18,
    17: 19,
    18: 20,
    19: 21,
    20: 22
  },
  cleric: {
    1: 4,
    2: 5,
    3: 6,
    4: 7,
    5: 9,
    6: 10,
    7: 11,
    8: 12,
    9: 14,
    10: 15,
    11: 16,
    12: 16,
    13: 17,
    14: 17,
    15: 18,
    16: 18,
    17: 19,
    18: 20,
    19: 21,
    20: 22
  },
  druid: {
    1: 4,
    2: 5,
    3: 6,
    4: 7,
    5: 9,
    6: 10,
    7: 11,
    8: 12,
    9: 14,
    10: 15,
    11: 16,
    12: 16,
    13: 17,
    14: 17,
    15: 18,
    16: 18,
    17: 19,
    18: 20,
    19: 21,
    20: 22
  },
  paladin: {
    1: 2,
    2: 3,
    3: 4,
    4: 5,
    5: 6,
    6: 6,
    7: 7,
    8: 7,
    9: 9,
    10: 9,
    11: 10,
    12: 10,
    13: 11,
    14: 11,
    15: 12,
    16: 12,
    17: 14,
    18: 14,
    19: 15,
    20: 15
  },
  ranger: {
    1: 2,
    2: 3,
    3: 4,
    4: 5,
    5: 6,
    6: 6,
    7: 7,
    8: 7,
    9: 9,
    10: 9,
    11: 10,
    12: 10,
    13: 11,
    14: 11,
    15: 12,
    16: 12,
    17: 14,
    18: 14,
    19: 15,
    20: 15
  },
  sorcerer: {
    1: 2,
    2: 4,
    3: 6,
    4: 7,
    5: 9,
    6: 10,
    7: 11,
    8: 12,
    9: 14,
    10: 15,
    11: 16,
    12: 16,
    13: 17,
    14: 17,
    15: 18,
    16: 18,
    17: 19,
    18: 20,
    19: 21,
    20: 22
  },
  warlock: {
    1: 2,
    2: 3,
    3: 4,
    4: 5,
    5: 6,
    6: 7,
    7: 8,
    8: 9,
    9: 10,
    10: 10,
    11: 11,
    12: 11,
    13: 12,
    14: 12,
    15: 13,
    16: 13,
    17: 14,
    18: 14,
    19: 15,
    20: 15
  },
  wizard: {
    1: 4,
    2: 5,
    3: 6,
    4: 7,
    5: 9,
    6: 10,
    7: 11,
    8: 12,
    9: 14,
    10: 15,
    11: 16,
    12: 16,
    13: 17,
    14: 17,
    15: 18,
    16: 18,
    17: 19,
    18: 22,
    19: 23,
    20: 25
  }
}

// Third-caster subclasses
export let THIRD_CASTER_SUBCLASSES: Record<string, string[]> = {
  fighter: ['eldritch-knight'],
  rogue: ['arcane-trickster']
}

// Load from JSON and overwrite defaults

/**
 * Converts a `Record<string, Record<string, number>>` (string keys from JSON)
 * to `Record<number, Record<number, number>>` (numeric keys for runtime use).
 */
function parseSlotTable(raw: Record<string, Record<string, number>>): Record<number, Record<number, number>> {
  const result: Record<number, Record<number, number>> = {}
  for (const [levelStr, slots] of Object.entries(raw)) {
    const level = Number(levelStr)
    result[level] = {}
    for (const [slotStr, count] of Object.entries(slots)) {
      result[level][Number(slotStr)] = count
    }
  }
  return result
}

/**
 * Converts a `Record<string, Record<string, number>>` keyed by class name
 * and string level to `Record<string, Record<number, number>>` with numeric levels.
 * Used for cantripsKnown and preparedSpells tables.
 */
function parseClassLevelTable(raw: Record<string, Record<string, number>>): Record<string, Record<number, number>> {
  const parsed: Record<string, Record<number, number>> = {}
  for (const [cls, table] of Object.entries(raw)) {
    parsed[cls] = {}
    for (const [lvl, count] of Object.entries(table)) {
      parsed[cls][Number(lvl)] = count
    }
  }
  return parsed
}

if (typeof window !== 'undefined') {
  load5eSpellSlots()
    .then((raw) => {
      const data = raw as Record<string, unknown>
      if (_loaded) return
      _loaded = true

      if (data.fullCaster) FULL_CASTER_SLOTS = parseSlotTable(data.fullCaster as Record<string, Record<string, number>>)
      if (data.warlock) WARLOCK_PACT_SLOTS = parseSlotTable(data.warlock as Record<string, Record<string, number>>)

      if (data.cantripsKnown) {
        CANTRIPS_KNOWN = parseClassLevelTable(data.cantripsKnown as Record<string, Record<string, number>>)
      }

      if (data.preparedSpells) {
        PREPARED_SPELLS = parseClassLevelTable(data.preparedSpells as Record<string, Record<string, number>>)
      }

      if (data.thirdCasterSubclasses) {
        THIRD_CASTER_SUBCLASSES = data.thirdCasterSubclasses as Record<string, string[]>
      }

      if (data.spellcastingAbilityMap) {
        Object.assign(SPELLCASTING_ABILITY_MAP, data.spellcastingAbilityMap)
      }

      if (data.thirdCasterAbilityMap) {
        Object.assign(THIRD_CASTER_ABILITY_MAP, data.thirdCasterAbilityMap)
      }
    })
    .catch((e) => logger.warn('[SpellData] Failed to preload spell slots', e))
}

/**
 * Returns the spellcasting ability for a class (or subclass for third-casters).
 */
export function getSpellcastingAbility(classId: string, subclassId?: string): AbilityName | undefined {
  if (SPELLCASTING_ABILITY_MAP[classId]) return SPELLCASTING_ABILITY_MAP[classId]
  if (subclassId && THIRD_CASTER_ABILITY_MAP[subclassId]) return THIRD_CASTER_ABILITY_MAP[subclassId]
  return undefined
}

/**
 * Computes spellcasting info (ability, DC, attack bonus) for a 5e character.
 */
export function computeSpellcastingInfo(
  classes: Array<{ classId: string; subclassId?: string; level: number }>,
  abilityScores: AbilityScoreSet,
  totalLevel: number,
  primaryClassId?: string,
  primarySubclassId?: string
): SpellcastingInfo5e | undefined {
  let ability: AbilityName | undefined
  if (primaryClassId) {
    ability = getSpellcastingAbility(primaryClassId, primarySubclassId)
  }
  if (!ability) {
    for (const cls of classes) {
      ability = getSpellcastingAbility(cls.classId, cls.subclassId)
      if (ability) break
    }
  }
  if (!ability) return undefined

  const profBonus = Math.ceil(totalLevel / 4) + 1
  const abilityMod = abilityModifier(abilityScores[ability])

  return {
    ability,
    spellSaveDC: 8 + profBonus + abilityMod,
    spellAttackBonus: profBonus + abilityMod
  }
}

/**
 * Returns the maximum number of prepared spells for any caster class.
 */
export function getPreparedSpellMax(classId: string, classLevel: number): number | null {
  const table = PREPARED_SPELLS[classId]
  if (!table) return null
  return table[classLevel] ?? null
}

export function isWarlockPactMagic(classId: string): boolean {
  return classId === 'warlock'
}

/** Returns the max spell level a warlock can cast (always <= 5) */
export function getWarlockMaxSpellLevel(level: number): number {
  const slots = WARLOCK_PACT_SLOTS[level]
  if (!slots) return 0
  return Math.max(...Object.keys(slots).map(Number))
}

export function getCantripsKnown(classId: string, level: number): number {
  const table = CANTRIPS_KNOWN[classId]
  if (!table) return 0
  let known = 0
  for (const [lvl, count] of Object.entries(table)) {
    if (level >= Number(lvl)) known = count
  }
  return known
}

export function getSlotProgression(classId: string, level: number): Record<number, number> {
  if (isWarlockPactMagic(classId)) {
    return WARLOCK_PACT_SLOTS[level] ?? {}
  }
  if (FULL_CASTERS_5E.includes(classId)) {
    return FULL_CASTER_SLOTS[level] ?? {}
  }
  if (HALF_CASTERS_5E.includes(classId)) {
    const effectiveLevel = Math.ceil(level / 2)
    return effectiveLevel >= 1 ? (FULL_CASTER_SLOTS[effectiveLevel] ?? {}) : {}
  }
  return {}
}

export function isThirdCaster(classId: string, subclassId?: string): boolean {
  const subs = THIRD_CASTER_SUBCLASSES[classId]
  return !!subs && subs.includes(subclassId ?? '')
}

/**
 * Calculate spell slots for a multiclass character.
 */
export function getMulticlassSpellSlots(
  classes: Array<{ classId: string; subclassId?: string; level: number }>
): Record<number, number> {
  let combinedLevel = 0
  for (const cls of classes) {
    if (cls.classId === 'warlock') continue
    if (FULL_CASTERS_5E.includes(cls.classId)) {
      combinedLevel += cls.level
    } else if (HALF_CASTERS_5E.includes(cls.classId)) {
      combinedLevel += Math.ceil(cls.level / 2)
    } else if (isThirdCaster(cls.classId, cls.subclassId)) {
      combinedLevel += Math.floor(cls.level / 3)
    }
  }
  return FULL_CASTER_SLOTS[combinedLevel] ?? {}
}

/**
 * Returns true if the character has multiple non-Warlock spellcasting classes.
 */
export function isMulticlassSpellcaster(
  classes: Array<{ classId: string; subclassId?: string; level: number }>
): boolean {
  let casterCount = 0
  for (const cls of classes) {
    if (cls.classId === 'warlock') continue
    if (
      FULL_CASTERS_5E.includes(cls.classId) ||
      HALF_CASTERS_5E.includes(cls.classId) ||
      isThirdCaster(cls.classId, cls.subclassId)
    ) {
      casterCount++
    }
  }
  return casterCount >= 2
}

/**
 * Returns Warlock Pact Magic slots for a multiclass character.
 */
export function getWarlockPactSlots(classes: Array<{ classId: string; level: number }>): Record<number, number> {
  const warlockClass = classes.find((c) => c.classId === 'warlock')
  if (!warlockClass) return {}
  return WARLOCK_PACT_SLOTS[warlockClass.level] ?? {}
}

/**
 * Returns true if any class in the array is a spellcaster.
 */
export function hasAnySpellcasting(classId: string): boolean {
  return FULL_CASTERS_5E.includes(classId) || HALF_CASTERS_5E.includes(classId) || isWarlockPactMagic(classId)
}

/**
 * Loads the full 5e spell list from the JSON data file.
 */
export async function loadSpells(): Promise<SpellEntry[]> {
  const raw = (await load5eSpells()) as unknown as Array<Record<string, unknown>>
  return raw.map((s) => ({
    id: String(s.id ?? ''),
    name: String(s.name ?? ''),
    level: Number(s.level ?? 0),
    school: String(s.school ?? ''),
    castingTime: String(s.castingTime ?? ''),
    range: String(s.range ?? ''),
    duration: String(s.duration ?? ''),
    components: String(s.components ?? ''),
    description: String(s.description ?? ''),
    classes: Array.isArray(s.classes) ? (s.classes as string[]) : [],
    concentration: Boolean(s.concentration),
    ritual: Boolean(s.ritual),
    higherLevels: typeof s.higherLevels === 'string' ? s.higherLevels : undefined
  }))
}

/**
 * Returns SpellEntry[] for spells granted by attuned magic items.
 */
export function getItemGrantedSpells(magicItems: MagicItemEntry5e[], knownSpells: SpellEntry[]): SpellEntry[] {
  const result: SpellEntry[] = []
  for (const item of magicItems) {
    if (!item.attuned && item.attunement) continue
    if (!item.grantedSpells?.length) continue
    for (const grant of item.grantedSpells) {
      // Check if already known
      const existing = knownSpells.find((s) => s.name === grant.spellName)
      if (existing) continue
      result.push({
        id: `item-${item.id}-${grant.spellId}`,
        name: grant.spellName,
        level: 0,
        description: `Granted by ${item.name}.`,
        castingTime: '',
        range: '',
        duration: '',
        components: '',
        source: 'item'
      })
    }
  }
  return result
}
