/**
 * Foundry VTT 5e actor JSON import.
 * Parses a Foundry VTT dnd5e system actor export into our Character5e format.
 */

import type { Character5e, EquipmentItem, Feature, SkillProficiency5e } from '../../types/character-5e'
import type {
  AbilityName,
  AbilityScoreSet,
  ArmorEntry,
  ClassFeatureEntry,
  SpellEntry,
  WeaponEntry
} from '../../types/character-common'
import { logger } from '../../utils/logger'

const JSON_FILTER = [{ name: 'JSON Files', extensions: ['json'] }]

// ---------------------------------------------------------------------------
// Foundry skill abbreviation → display name + ability
// ---------------------------------------------------------------------------

const SKILL_MAP: Record<string, { name: string; ability: AbilityName }> = {
  acr: { name: 'Acrobatics', ability: 'dexterity' },
  ani: { name: 'Animal Handling', ability: 'wisdom' },
  arc: { name: 'Arcana', ability: 'intelligence' },
  ath: { name: 'Athletics', ability: 'strength' },
  dec: { name: 'Deception', ability: 'charisma' },
  his: { name: 'History', ability: 'intelligence' },
  ins: { name: 'Insight', ability: 'wisdom' },
  itm: { name: 'Intimidation', ability: 'charisma' },
  inv: { name: 'Investigation', ability: 'intelligence' },
  med: { name: 'Medicine', ability: 'wisdom' },
  nat: { name: 'Nature', ability: 'intelligence' },
  prc: { name: 'Perception', ability: 'wisdom' },
  prf: { name: 'Performance', ability: 'charisma' },
  per: { name: 'Persuasion', ability: 'charisma' },
  rel: { name: 'Religion', ability: 'intelligence' },
  slt: { name: 'Sleight of Hand', ability: 'dexterity' },
  ste: { name: 'Stealth', ability: 'dexterity' },
  sur: { name: 'Survival', ability: 'wisdom' }
}

const SPELL_SCHOOL_MAP: Record<string, string> = {
  abj: 'Abjuration',
  con: 'Conjuration',
  div: 'Divination',
  enc: 'Enchantment',
  evo: 'Evocation',
  ill: 'Illusion',
  nec: 'Necromancy',
  trs: 'Transmutation'
}

const ABILITY_KEYS: AbilityName[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
const FOUNDRY_ABILITY_MAP: Record<string, AbilityName> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma'
}

/** Minimal structural type for Foundry VTT item entries (external JSON, no guaranteed schema). */
interface FoundryItem {
  _id?: string
  name?: string
  type?: string
  system?: {
    description?: { value?: string }
    damage?: { parts?: [string, string][] }
    attackBonus?: number
    properties?: string[]
    range?: { value?: number; long?: number }
    proficient?: boolean
    weight?: number
    armor?: { value?: number }
    equipped?: boolean
    type?: { value?: string }
    stealth?: boolean
    strength?: number
    quantity?: number
    level?: number
    school?: string
    activation?: { type?: string }
    duration?: { value?: number; units?: string }
    components?: { vocal?: boolean; somatic?: boolean; material?: boolean; concentration?: boolean; ritual?: boolean }
    materials?: { value?: string }
    requirements?: string
    levels?: number
    subclass?: string
  }
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

/**
 * Import a Foundry VTT 5e actor JSON and convert to Character5e.
 * Returns the converted character or null if cancelled/invalid/error.
 */
export async function importFoundryCharacter(): Promise<Character5e | null> {
  try {
    const filePath = await window.api.showOpenDialog({ title: 'Import Foundry VTT Character', filters: JSON_FILTER })
    if (!filePath) return null

    const raw = await window.api.readFile(filePath)
    const actor = JSON.parse(raw)

    // Detect Foundry format: must have system.abilities
    const sys = actor.system
    if (!sys || !sys.abilities) {
      logger.error('Import Foundry: not a valid Foundry VTT 5e actor export')
      return null
    }

    // Ability scores
    const abilityScores: AbilityScoreSet = {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    }
    for (const [abbr, ability] of Object.entries(FOUNDRY_ABILITY_MAP)) {
      const val = sys.abilities?.[abbr]?.value
      if (typeof val === 'number') abilityScores[ability] = val
    }

    // HP
    const hp = sys.attributes?.hp ?? {}
    const hitPoints = {
      current: hp.value ?? 10,
      maximum: hp.max ?? 10,
      temporary: hp.temp ?? 0
    }

    // AC
    const armorClass = sys.attributes?.ac?.flat ?? sys.attributes?.ac?.value ?? 10

    // Speed
    const movement = sys.attributes?.movement ?? {}
    const speed = movement.walk ?? 30
    const speeds = {
      swim: movement.swim ?? 0,
      fly: movement.fly ?? 0,
      climb: movement.climb ?? 0,
      burrow: movement.burrow ?? 0
    }

    // Skills
    const skills: SkillProficiency5e[] = Object.entries(SKILL_MAP).map(([abbr, info]) => {
      const skillData = sys.skills?.[abbr]
      const value = skillData?.value ?? 0
      return {
        name: info.name,
        ability: info.ability,
        proficient: value >= 1,
        expertise: value >= 2
      }
    })

    // Details
    const details = sys.details ?? {}
    const speciesName = details.race ?? details.type?.value ?? 'Human'
    const background = details.background ?? ''
    const alignment = details.alignment ?? ''
    const level = details.level ?? 1

    // Currency
    const curr = sys.currency ?? {}
    const treasure = {
      cp: curr.cp ?? 0,
      sp: curr.sp ?? 0,
      gp: curr.gp ?? 0,
      pp: curr.pp ?? 0,
      ep: curr.ep ?? 0
    }

    // Traits (languages, resistances, immunities, vulnerabilities)
    const traits = sys.traits ?? {}
    const languages = Array.isArray(traits.languages?.value) ? (traits.languages.value as string[]) : []
    const resistances = Array.isArray(traits.dr?.value) ? (traits.dr.value as string[]) : []
    const immunities = Array.isArray(traits.di?.value) ? (traits.di.value as string[]) : []
    const vulnerabilities = Array.isArray(traits.dv?.value) ? (traits.dv.value as string[]) : []

    // Saving throw proficiencies
    const savingThrows: AbilityName[] = ABILITY_KEYS.filter((ability) => {
      const abbr = Object.entries(FOUNDRY_ABILITY_MAP).find(([, a]) => a === ability)?.[0]
      return abbr && sys.abilities?.[abbr]?.proficient
    })

    // Parse items array
    const items = Array.isArray(actor.items) ? actor.items : []
    const weapons: WeaponEntry[] = []
    const armor: ArmorEntry[] = []
    const equipment: EquipmentItem[] = []
    const knownSpells: SpellEntry[] = []
    const feats: Array<{ id: string; name: string; description: string }> = []
    const classFeatures: ClassFeatureEntry[] = []
    const features: Feature[] = []
    const classes: Array<{ name: string; level: number; subclass?: string; hitDie: number }> = []

    const hitDieMap: Record<string, number> = {
      barbarian: 12,
      bard: 8,
      cleric: 8,
      druid: 8,
      fighter: 10,
      monk: 8,
      paladin: 10,
      ranger: 10,
      rogue: 8,
      sorcerer: 6,
      warlock: 8,
      wizard: 6
    }

    for (const item of items as FoundryItem[]) {
      const name: string = item.name ?? 'Unknown'
      const desc: string = (item.system?.description?.value ?? '').replace(/<[^>]*>/g, '').slice(0, 500)
      const itemType: string = item.type ?? ''

      switch (itemType) {
        case 'weapon': {
          const dmg = item.system?.damage?.parts?.[0]
          weapons.push({
            id: item._id ?? crypto.randomUUID(),
            name,
            damage: dmg?.[0] ?? '1d4',
            damageType: dmg?.[1] ?? 'bludgeoning',
            attackBonus: item.system?.attackBonus ?? 0,
            properties: Array.isArray(item.system?.properties) ? item.system.properties : [],
            description: desc,
            range: item.system?.range?.value
              ? `${item.system.range.value}/${item.system.range.long ?? item.system.range.value * 3}`
              : undefined,
            proficient: item.system?.proficient ?? true,
            weight: item.system?.weight ?? undefined
          })
          break
        }
        case 'equipment': {
          if (item.system?.armor?.value || item.system?.type?.value === 'shield') {
            armor.push({
              id: item._id ?? crypto.randomUUID(),
              name,
              acBonus: item.system?.armor?.value ?? 0,
              equipped: item.system?.equipped ?? false,
              type: item.system?.type?.value === 'shield' ? 'shield' : 'armor',
              description: desc,
              stealthDisadvantage: item.system?.stealth ?? undefined,
              strength: typeof item.system?.strength === 'number' ? item.system.strength : undefined,
              weight: item.system?.weight ?? undefined
            })
          } else {
            equipment.push({
              name,
              quantity: item.system?.quantity ?? 1,
              weight: item.system?.weight ?? undefined,
              description: desc,
              equipped: item.system?.equipped ?? false,
              type: 'Equipment'
            })
          }
          break
        }
        case 'spell': {
          const spellLevel = item.system?.level ?? 0
          const school = SPELL_SCHOOL_MAP[item.system?.school ?? ''] ?? undefined
          knownSpells.push({
            id: item._id ?? crypto.randomUUID(),
            name,
            level: spellLevel,
            description: desc,
            castingTime: item.system?.activation?.type ?? '1 action',
            range: item.system?.range?.value ? `${item.system.range.value} ft` : 'Self',
            duration: item.system?.duration?.value
              ? `${item.system.duration.value} ${item.system.duration.units ?? 'round'}`
              : 'Instantaneous',
            components:
              [
                item.system?.components?.vocal ? 'V' : '',
                item.system?.components?.somatic ? 'S' : '',
                item.system?.components?.material
                  ? `M${item.system?.materials?.value ? ` (${item.system.materials.value})` : ''}`
                  : ''
              ]
                .filter(Boolean)
                .join(', ') || 'None',
            school,
            concentration: item.system?.components?.concentration ?? false,
            ritual: item.system?.components?.ritual ?? false
          })
          break
        }
        case 'feat': {
          const reqLevel = item.system?.requirements ?? ''
          const levelMatch = reqLevel.match?.(/(\d+)/)
          if (item.system?.type?.value === 'class') {
            classFeatures.push({
              level: levelMatch ? parseInt(levelMatch[1], 10) : 1,
              name,
              source: item.system?.requirements ?? 'Class',
              description: desc
            })
          } else {
            feats.push({
              id: item._id ?? crypto.randomUUID(),
              name,
              description: desc
            })
          }
          break
        }
        case 'class': {
          const className = name
          const classLevel = item.system?.levels ?? 1
          const subclass = item.system?.subclass ?? undefined
          classes.push({
            name: className,
            level: classLevel,
            subclass,
            hitDie: hitDieMap[className.toLowerCase()] ?? 8
          })
          break
        }
        case 'loot':
        case 'consumable':
        case 'tool':
        case 'backpack':
          equipment.push({
            name,
            quantity: item.system?.quantity ?? 1,
            weight: item.system?.weight ?? undefined,
            description: desc,
            equipped: item.system?.equipped ?? false,
            type: itemType.charAt(0).toUpperCase() + itemType.slice(1)
          })
          break
        default:
          // Features from background, race, etc.
          if (name && desc) {
            features.push({ name, source: itemType || 'Other', description: desc })
          }
          break
      }
    }

    // If no classes found from items, create a default from level
    if (classes.length === 0) {
      classes.push({ name: 'Unknown', level: level || 1, hitDie: 8 })
    }

    const totalLevel = classes.reduce((sum, c) => sum + c.level, 0) || 1

    const now = new Date().toISOString()
    const character: Character5e = {
      id: crypto.randomUUID(),
      gameSystem: 'dnd5e',
      campaignId: null,
      playerId: '',

      name: actor.name ?? 'Imported Character',
      species: speciesName,
      classes,
      level: totalLevel,
      background,
      alignment,
      xp: details.xp?.value ?? 0,
      levelingMode: 'milestone',

      abilityScores,
      hitPoints,
      hitDice: classes.map((cls) => ({ current: cls.level, maximum: cls.level, dieType: cls.hitDie })),
      armorClass,
      initiative: 0,
      speed,
      speeds,
      senses: Array.isArray(sys.attributes?.senses) ? sys.attributes.senses : [],
      resistances,
      immunities,
      vulnerabilities,

      details: {
        personality: details.trait ?? undefined,
        ideals: details.ideal ?? undefined,
        bonds: details.bond ?? undefined,
        flaws: details.flaw ?? undefined,
        appearance: details.appearance ?? undefined
      },

      proficiencies: {
        weapons: Array.isArray(traits.weaponProf?.value) ? traits.weaponProf.value : [],
        armor: Array.isArray(traits.armorProf?.value) ? traits.armorProf.value : [],
        tools: Array.isArray(traits.toolProf?.value) ? traits.toolProf.value : [],
        languages,
        savingThrows
      },
      skills,

      equipment,
      treasure,
      features,
      knownSpells,
      preparedSpellIds: knownSpells
        .filter((_, i) => {
          const item = items.find((it: { _id?: string }) => it._id === knownSpells[i]?.id)
          return item?.system?.preparation?.prepared ?? false
        })
        .map((s) => s.id),
      spellSlotLevels: {},
      classFeatures,
      weapons,
      armor,
      feats,

      buildChoices: {
        speciesId: speciesName.toLowerCase().replace(/\s+/g, '-'),
        classId: (classes[0]?.name ?? 'fighter').toLowerCase(),
        subclassId: classes[0]?.subclass?.toLowerCase().replace(/\s+/g, '-'),
        backgroundId: background.toLowerCase().replace(/\s+/g, '-'),
        selectedSkills: skills.filter((s) => s.proficient).map((s) => s.name),
        abilityScoreMethod: 'custom',
        abilityScoreAssignments: {}
      },

      status: 'active',
      campaignHistory: [],
      backstory: details.biography?.value?.replace(/<[^>]*>/g, '') ?? '',
      notes: '',
      pets: [],
      deathSaves: { successes: 0, failures: 0 },
      heroicInspiration: false,
      attunement: [],
      conditions: [],
      languageDescriptions: {},
      createdAt: now,
      updatedAt: now
    }

    return character
  } catch (err) {
    logger.error('Import Foundry VTT character failed:', err)
    return null
  }
}
