import {
  FULL_CASTER_SLOTS,
  FULL_CASTERS_5E,
  HALF_CASTERS_5E,
  THIRD_CASTER_SUBCLASSES,
  WARLOCK_PACT_SLOTS
} from '../../services/character/spell-data'
import {
  load5eBackgrounds,
  load5eClassFeatures,
  load5eEquipment,
  load5eSpellSlots,
  load5eSpells
} from '../../services/data-provider'
import type { AbilityName, ClassFeatureEntry, Currency, SpellEntry } from '../../types/character-common'
import { logger } from '../../utils/logger'
import type { GameSystemPlugin, SheetConfig } from '../types'

// --- Spell slot tables loaded from JSON via spell-data.ts ---

// Half caster and third caster tables (loaded from spell-slots.json)
let HALF_CASTER_SLOTS: Record<number, Record<number, number>> = {}
let THIRD_CASTER_SLOTS: Record<number, Record<number, number>> = {}

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

load5eSpellSlots()
  .then((raw) => {
    const data = raw as Record<string, unknown>
    if (data.halfCaster) HALF_CASTER_SLOTS = parseSlotTable(data.halfCaster as Record<string, Record<string, number>>)
    if (data.thirdCaster)
      THIRD_CASTER_SLOTS = parseSlotTable(data.thirdCaster as Record<string, Record<string, number>>)
  })
  .catch((e) => logger.warn('[5eSystem] Failed to preload spell slots', e))

const FULL_CASTERS = FULL_CASTERS_5E
const HALF_CASTERS = HALF_CASTERS_5E
const THIRD_CASTERS = Object.keys(THIRD_CASTER_SUBCLASSES)
const SPELLCASTERS = [...FULL_CASTERS, ...HALF_CASTERS, 'warlock']

// --- 5e Skill definitions ---
const SKILL_DEFINITIONS: Array<{ name: string; ability: AbilityName }> = [
  { name: 'Acrobatics', ability: 'dexterity' },
  { name: 'Animal Handling', ability: 'wisdom' },
  { name: 'Arcana', ability: 'intelligence' },
  { name: 'Athletics', ability: 'strength' },
  { name: 'Deception', ability: 'charisma' },
  { name: 'History', ability: 'intelligence' },
  { name: 'Insight', ability: 'wisdom' },
  { name: 'Intimidation', ability: 'charisma' },
  { name: 'Investigation', ability: 'intelligence' },
  { name: 'Medicine', ability: 'wisdom' },
  { name: 'Nature', ability: 'intelligence' },
  { name: 'Perception', ability: 'wisdom' },
  { name: 'Performance', ability: 'charisma' },
  { name: 'Persuasion', ability: 'charisma' },
  { name: 'Religion', ability: 'intelligence' },
  { name: 'Sleight of Hand', ability: 'dexterity' },
  { name: 'Stealth', ability: 'dexterity' },
  { name: 'Survival', ability: 'wisdom' }
]

// --- Sheet config ---
const SHEET_CONFIG: SheetConfig = {
  showInitiative: true,
  showPerception: false,
  showClassDC: false,
  showBulk: false,
  showElectrum: true,
  showFocusPoints: false,
  proficiencyStyle: 'dots'
}

// --- Plugin implementation ---

export const dnd5ePlugin: GameSystemPlugin = {
  id: 'dnd5e',
  name: 'D&D 5th Edition',

  getSpellSlotProgression(className: string, level: number): Record<number, number> {
    const clampedLevel = Math.max(1, Math.min(20, level))
    const cls = className.toLowerCase()

    if (cls === 'warlock') return WARLOCK_PACT_SLOTS[clampedLevel] ?? {}
    if (FULL_CASTERS.includes(cls)) return FULL_CASTER_SLOTS[clampedLevel] ?? {}
    if (HALF_CASTERS.includes(cls)) return HALF_CASTER_SLOTS[clampedLevel] ?? {}
    if (THIRD_CASTERS.includes(cls)) return THIRD_CASTER_SLOTS[clampedLevel] ?? {}

    return {}
  },

  async getSpellList(className: string): Promise<SpellEntry[]> {
    try {
      const spells = await load5eSpells()
      const cls = className.toLowerCase()
      return spells
        .filter((s) => {
          if (!s.classes) return false
          return s.classes.some((c) => c.toLowerCase() === cls)
        })
        .map((s) => ({
          id: s.id ?? s.name.toLowerCase().replace(/\s+/g, '-'),
          name: s.name,
          level: s.level ?? 0,
          description: s.description ?? '',
          castingTime: s.castingTime ?? ((s as unknown as Record<string, unknown>).casting_time as string) ?? '',
          range: s.range ?? '',
          duration: s.duration ?? '',
          components: s.components ?? '',
          school: s.school,
          concentration: s.concentration ?? false,
          ritual: s.ritual ?? false,
          classes: s.classes
        }))
    } catch (error) {
      logger.error('[dnd5e] Failed to load spell list:', error)
      return []
    }
  },

  isSpellcaster(className: string): boolean {
    return SPELLCASTERS.includes(className.toLowerCase())
  },

  async getStartingGold(_classId: string, backgroundId: string): Promise<Currency> {
    try {
      const backgrounds = await load5eBackgrounds()
      const gold = backgrounds.find((b) => b.id === backgroundId)?.startingGold ?? 10
      return { cp: 0, sp: 0, gp: gold, pp: 0, ep: 0 }
    } catch (error) {
      logger.error('[dnd5e] Failed to load starting gold:', error)
      return { cp: 0, sp: 0, gp: 10, pp: 0, ep: 0 }
    }
  },

  async getClassFeatures(classId: string, level: number): Promise<ClassFeatureEntry[]> {
    try {
      const data = await load5eClassFeatures()
      const classData = data[classId]
      const features = classData?.features ?? []
      return features
        .filter((f) => f.level <= level)
        .map((f) => ({
          level: f.level,
          name: f.name,
          source: classId,
          description: f.description ?? ''
        }))
    } catch (error) {
      logger.error('[dnd5e] Failed to load class features:', error)
      return []
    }
  },

  async loadEquipment(): Promise<{ weapons: unknown[]; armor: unknown[]; shields: unknown[]; gear: unknown[] }> {
    try {
      const data = (await load5eEquipment()) as import('../../types/data').EquipmentFile & {
        shields?: unknown[]
        adventuringGear?: unknown[]
      }
      return {
        weapons: data.weapons ?? [],
        armor: data.armor ?? [],
        shields: data.shields ?? [],
        gear: data.gear ?? data.adventuringGear ?? []
      }
    } catch (error) {
      logger.error('[dnd5e] Failed to load equipment:', error)
      return { weapons: [], armor: [], shields: [], gear: [] }
    }
  },

  getSkillDefinitions(): Array<{ name: string; ability: AbilityName }> {
    return SKILL_DEFINITIONS
  },

  getSheetConfig(): SheetConfig {
    return SHEET_CONFIG
  }
}
