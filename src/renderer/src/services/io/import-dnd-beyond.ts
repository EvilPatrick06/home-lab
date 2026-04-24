/**
 * D&D Beyond character import.
 * Converts a DDB JSON export to our Character5e format.
 *
 * Extracts: ability scores, classes, species, HP, alignment, background,
 * proficiencies, skills, equipment, weapons, armor, spells, feats,
 * class features, speed, senses, resistances, immunities, death saves.
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
// DDB modifier types
// ---------------------------------------------------------------------------

interface DdbModifier {
  type?: string
  subType?: string
  value?: number
  friendlySubtypeName?: string
  friendlyTypeName?: string
}

type DdbModifiers = Record<string, DdbModifier[]>

// ---------------------------------------------------------------------------
// Ability score helpers
// ---------------------------------------------------------------------------

const ID_TO_ABILITY: Record<number, AbilityName> = {
  1: 'strength',
  2: 'dexterity',
  3: 'constitution',
  4: 'intelligence',
  5: 'wisdom',
  6: 'charisma'
}

function extractAbilityScores(stats: Array<{ id?: number; value?: number }> | undefined): AbilityScoreSet {
  const scores: AbilityScoreSet = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  }
  if (!Array.isArray(stats)) return scores

  for (const stat of stats) {
    const name = ID_TO_ABILITY[stat.id ?? 0]
    if (name && typeof stat.value === 'number') {
      scores[name] = stat.value
    }
  }
  return scores
}

function applyAbilityBonuses(baseScores: AbilityScoreSet, modifiers: DdbModifiers | undefined): AbilityScoreSet {
  const scores = { ...baseScores }
  if (!modifiers || typeof modifiers !== 'object') return scores

  const subTypeToAbility: Record<string, AbilityName> = {
    'strength-score': 'strength',
    'dexterity-score': 'dexterity',
    'constitution-score': 'constitution',
    'intelligence-score': 'intelligence',
    'wisdom-score': 'wisdom',
    'charisma-score': 'charisma'
  }

  const allModifiers = Object.values(modifiers).flat()
  for (const mod of allModifiers) {
    if (mod.type === 'bonus' && mod.subType && typeof mod.value === 'number') {
      const ability = subTypeToAbility[mod.subType]
      if (ability) {
        scores[ability] += mod.value
      }
    }
  }
  return scores
}

function getHitDie(className: string): number {
  const hitDice: Record<string, number> = {
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
  return hitDice[className.toLowerCase()] ?? 8
}

// ---------------------------------------------------------------------------
// Enhanced extraction helpers
// ---------------------------------------------------------------------------

function extractProficiencies(modifiers: DdbModifiers | undefined): {
  weapons: string[]
  armor: string[]
  tools: string[]
  languages: string[]
  savingThrows: AbilityName[]
} {
  const result = {
    weapons: [] as string[],
    armor: [] as string[],
    tools: [] as string[],
    languages: [] as string[],
    savingThrows: [] as AbilityName[]
  }
  if (!modifiers) return result

  const allMods = Object.values(modifiers).flat()
  const seen = new Set<string>()

  for (const mod of allMods) {
    if (mod.type !== 'proficiency' || !mod.subType) continue
    const key = mod.subType
    if (seen.has(key)) continue
    seen.add(key)

    const name = mod.friendlySubtypeName ?? mod.subType.replace(/-/g, ' ')

    if (key.includes('saving-throws')) {
      const abilityKey = key.replace('-saving-throws', '') as AbilityName
      if (['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(abilityKey)) {
        result.savingThrows.push(abilityKey)
      }
    } else if (key.includes('armor') || key.includes('shield')) {
      result.armor.push(name)
    } else if (
      key.includes('weapon') ||
      key.includes('sword') ||
      key.includes('bow') ||
      key.includes('crossbow') ||
      key.includes('dagger') ||
      key.includes('axe') ||
      key.includes('mace') ||
      key.includes('staff') ||
      key.includes('hammer') ||
      key.includes('spear') ||
      key.includes('pike') ||
      key.includes('halberd') ||
      key.includes('rapier') ||
      key.includes('scimitar') ||
      key.includes('flail') ||
      key.includes('morningstar') ||
      key.includes('trident') ||
      key.includes('javelin') ||
      key.includes('club') ||
      key.includes('whip') ||
      key.includes('glaive') ||
      key.includes('maul') ||
      key.includes('lance') ||
      key.includes('dart') ||
      key.includes('sling') ||
      key.includes('blowgun')
    ) {
      result.weapons.push(name)
    } else if (key.includes('language')) {
      result.languages.push(name.replace(/language[:\s]*/i, ''))
    } else {
      result.tools.push(name)
    }
  }

  return result
}

const SKILL_ABILITY_MAP: Record<string, AbilityName> = {
  acrobatics: 'dexterity',
  'animal-handling': 'wisdom',
  arcana: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  nature: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  religion: 'intelligence',
  'sleight-of-hand': 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom'
}

const SKILL_DISPLAY_NAMES: Record<string, string> = {
  acrobatics: 'Acrobatics',
  'animal-handling': 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  'sleight-of-hand': 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival'
}

function extractSkills(modifiers: DdbModifiers | undefined): SkillProficiency5e[] {
  const proficient = new Set<string>()
  const expertise = new Set<string>()

  if (modifiers) {
    const allMods = Object.values(modifiers).flat()
    for (const mod of allMods) {
      if (!mod.subType) continue
      const skillKey = mod.subType.replace(/-/g, '-')

      if (mod.type === 'expertise') {
        expertise.add(skillKey)
        proficient.add(skillKey)
      } else if (mod.type === 'proficiency') {
        if (SKILL_ABILITY_MAP[skillKey]) {
          proficient.add(skillKey)
        }
      } else if (mod.type === 'half-proficiency' || mod.type === 'half-proficiency-round-up') {
        proficient.add(skillKey)
      }
    }
  }

  return Object.entries(SKILL_ABILITY_MAP).map(([key, ability]) => ({
    name: SKILL_DISPLAY_NAMES[key] ?? key,
    ability,
    proficient: proficient.has(key),
    expertise: expertise.has(key)
  }))
}

function extractInventory(data: Record<string, unknown>): {
  equipment: EquipmentItem[]
  weapons: WeaponEntry[]
  armor: ArmorEntry[]
} {
  const equipment: EquipmentItem[] = []
  const weapons: WeaponEntry[] = []
  const armor: ArmorEntry[] = []

  if (!Array.isArray(data.inventory)) return { equipment, weapons, armor }

  for (const item of data.inventory) {
    const def = item.definition
    if (!def) continue

    const name = def.name ?? 'Unknown Item'
    const quantity = item.quantity ?? 1
    const weight = def.weight ?? undefined
    const description = def.description ?? def.snippet ?? ''
    const equipped = item.equipped ?? false
    const filterType = def.filterType ?? ''
    const cost = def.cost ? `${def.cost} gp` : undefined

    if (filterType === 'Weapon' || def.type === 'Weapon') {
      const damage = (def.damage?.diceString ?? def.fixedDamage) ? `${def.fixedDamage}` : '1d4'
      const damageType = def.damageType?.toLowerCase() ?? 'bludgeoning'
      const properties = Array.isArray(def.properties) ? def.properties.map((p: { name?: string }) => p.name ?? '') : []
      const range = def.range ? `${def.range}/${def.longRange ?? def.range * 3}` : undefined

      weapons.push({
        id: crypto.randomUUID(),
        name,
        damage,
        damageType,
        attackBonus: 0,
        properties,
        description: description.replace(/<[^>]*>/g, ''),
        range,
        proficient: true,
        cost,
        weight
      })
    } else if (filterType === 'Armor' || def.armorClass) {
      const armorType = def.type?.toLowerCase().includes('shield')
        ? ('shield' as const)
        : def.armorTypeId
          ? ('armor' as const)
          : ('clothing' as const)

      armor.push({
        id: crypto.randomUUID(),
        name,
        acBonus: def.armorClass ?? 0,
        equipped,
        type: armorType,
        description: description.replace(/<[^>]*>/g, ''),
        stealthDisadvantage: def.stealthCheck === 1 ? true : undefined,
        strength: typeof def.strengthRequirement === 'number' ? def.strengthRequirement : undefined,
        cost,
        weight
      })
    } else {
      equipment.push({
        name,
        quantity,
        weight,
        description: description.replace(/<[^>]*>/g, '').slice(0, 300),
        equipped,
        cost,
        type: filterType || undefined
      })
    }
  }

  return { equipment, weapons, armor }
}

function extractSpells(data: Record<string, unknown>): { knownSpells: SpellEntry[]; preparedSpellIds: string[] } {
  const knownSpells: SpellEntry[] = []
  const preparedSpellIds: string[] = []

  const schoolMap: Record<string, string> = {
    Abjuration: 'Abjuration',
    Conjuration: 'Conjuration',
    Divination: 'Divination',
    Enchantment: 'Enchantment',
    Evocation: 'Evocation',
    Illusion: 'Illusion',
    Necromancy: 'Necromancy',
    Transmutation: 'Transmutation'
  }

  const spellSources = [
    ...(Array.isArray(data.classSpells) ? data.classSpells : []),
    ...(Array.isArray(data.spells) ? [{ spells: data.spells }] : [])
  ]

  const seenIds = new Set<string>()

  for (const source of spellSources) {
    const spells = Array.isArray(source.spells) ? source.spells : []
    for (const s of spells) {
      const def = s.definition ?? s
      if (!def || !def.name) continue

      const id = def.id ? String(def.id) : crypto.randomUUID()
      if (seenIds.has(id)) continue
      seenIds.add(id)

      const spell: SpellEntry = {
        id,
        name: def.name,
        level: def.level ?? 0,
        description: (def.description ?? '').replace(/<[^>]*>/g, '').slice(0, 500),
        castingTime: def.castingTime?.castingTimeInterval
          ? `${def.castingTime.castingTimeInterval} ${def.castingTime.castingTimeType ?? 'action'}`
          : '1 action',
        range: def.range?.origin ? `${def.range.rangeValue ?? 0} ft` : 'Self',
        duration: def.duration?.durationInterval
          ? `${def.duration.durationInterval} ${def.duration.durationType ?? 'round'}`
          : 'Instantaneous',
        components:
          [
            def.components?.includes(1) ? 'V' : '',
            def.components?.includes(2) ? 'S' : '',
            def.components?.includes(3) ? `M${def.componentsDescription ? ` (${def.componentsDescription})` : ''}` : ''
          ]
            .filter(Boolean)
            .join(', ') || 'None',
        school: schoolMap[def.school ?? ''] ?? undefined,
        concentration: def.concentration ?? false,
        ritual: def.ritual ?? false,
        classes: Array.isArray(def.classes)
          ? def.classes.map((c: { name?: string }) => c.name).filter(Boolean)
          : undefined
      }

      knownSpells.push(spell)

      if (s.prepared || s.alwaysPrepared) {
        preparedSpellIds.push(id)
      }
    }
  }

  return { knownSpells, preparedSpellIds }
}

function extractFeats(data: Record<string, unknown>): Array<{ id: string; name: string; description: string }> {
  if (!Array.isArray(data.feats)) return []

  return data.feats.map((f: { definition?: { name?: string; description?: string; id?: number } }) => ({
    id: f.definition?.id ? String(f.definition.id) : crypto.randomUUID(),
    name: f.definition?.name ?? 'Unknown Feat',
    description: (f.definition?.description ?? '').replace(/<[^>]*>/g, '').slice(0, 500)
  }))
}

function extractClassFeatures(data: Record<string, unknown>): ClassFeatureEntry[] {
  const features: ClassFeatureEntry[] = []
  const classes = Array.isArray(data.classes) ? data.classes : []

  for (const cls of classes) {
    const className = cls.definition?.name ?? 'Unknown'
    const classFeatures = Array.isArray(cls.classFeatures) ? cls.classFeatures : []

    for (const f of classFeatures) {
      const def = f.definition ?? f
      if (!def?.name) continue

      features.push({
        level: def.requiredLevel ?? def.level ?? cls.level ?? 1,
        name: def.name,
        source: className,
        description: (def.description ?? '').replace(/<[^>]*>/g, '').slice(0, 500)
      })
    }

    // Subclass features
    const subFeatures = Array.isArray(cls.subclassDefinition?.classFeatures) ? cls.subclassDefinition.classFeatures : []
    const subName = cls.subclassDefinition?.name ?? className

    for (const f of subFeatures) {
      if (!f?.name) continue
      features.push({
        level: f.requiredLevel ?? f.level ?? 1,
        name: f.name,
        source: subName,
        description: (f.description ?? '').replace(/<[^>]*>/g, '').slice(0, 500)
      })
    }
  }

  return features
}

function extractRaceFeatures(data: Record<string, unknown>): Feature[] {
  const features: Feature[] = []
  const race = data.race as Record<string, unknown> | undefined

  const racialTraits = Array.isArray(race?.racialTraits) ? race.racialTraits : []
  for (const trait of racialTraits) {
    const def = trait.definition ?? trait
    if (!def?.name) continue
    features.push({
      name: def.name,
      source: (race?.fullName as string) ?? (race?.baseName as string) ?? 'Species',
      description: (def.description ?? '').replace(/<[^>]*>/g, '').slice(0, 500)
    })
  }

  return features
}

function extractDefenses(
  data: Record<string, unknown>,
  modifiers: DdbModifiers | undefined
): {
  speed: number
  speeds: { swim: number; fly: number; climb: number; burrow: number }
  senses: string[]
  resistances: string[]
  immunities: string[]
  vulnerabilities: string[]
} {
  const result = {
    speed: 30,
    speeds: { swim: 0, fly: 0, climb: 0, burrow: 0 },
    senses: [] as string[],
    resistances: [] as string[],
    immunities: [] as string[],
    vulnerabilities: [] as string[]
  }

  // Speed from race
  const race = data.race as Record<string, unknown> | undefined
  const weightSpeeds = race?.weightSpeeds as Record<string, Record<string, unknown>> | undefined
  const normal = weightSpeeds?.normal
  const walkSpeed = normal?.walk
  if (typeof walkSpeed === 'number') result.speed = walkSpeed
  const swim = normal?.swim
  if (typeof swim === 'number') result.speeds.swim = swim
  const fly = normal?.fly
  if (typeof fly === 'number') result.speeds.fly = fly
  const climb = normal?.climb
  if (typeof climb === 'number') result.speeds.climb = climb
  const burrow = normal?.burrow
  if (typeof burrow === 'number') result.speeds.burrow = burrow

  if (!modifiers) return result

  const allMods = Object.values(modifiers).flat()
  const sensesSet = new Set<string>()
  const resistSet = new Set<string>()
  const immuneSet = new Set<string>()
  const vulnSet = new Set<string>()

  for (const mod of allMods) {
    if (!mod.subType) continue
    const name = mod.friendlySubtypeName ?? mod.subType.replace(/-/g, ' ')

    if (mod.type === 'sense') {
      const range = typeof mod.value === 'number' ? ` ${mod.value} ft.` : ''
      sensesSet.add(`${name}${range}`)
    } else if (mod.type === 'resistance') {
      resistSet.add(name)
    } else if (mod.type === 'immunity') {
      immuneSet.add(name)
    } else if (mod.type === 'vulnerability') {
      vulnSet.add(name)
    }
  }

  result.senses = [...sensesSet]
  result.resistances = [...resistSet]
  result.immunities = [...immuneSet]
  result.vulnerabilities = [...vulnSet]

  return result
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

/**
 * Import a D&D Beyond JSON character export and convert it to our Character5e format.
 * Returns the converted character or null if cancelled/invalid/error.
 */
export async function importDndBeyondCharacter(): Promise<Character5e | null> {
  try {
    const filePath = await window.api.showOpenDialog({ title: 'Import D&D Beyond Character', filters: JSON_FILTER })
    if (!filePath) return null

    const raw = await window.api.readFile(filePath)
    const ddb = JSON.parse(raw)

    // DDB exports sometimes wrap in a "data" property
    const data = ddb.data ?? ddb

    // Validate minimum DDB structure
    if (!data || typeof data.name !== 'string') {
      logger.error('Import DDB: not a valid D&D Beyond character export')
      return null
    }

    // Extract ability scores with bonuses
    const baseScores = extractAbilityScores(data.stats)
    const abilityScores = applyAbilityBonuses(baseScores, data.modifiers)

    // Extract classes
    const ddbClasses: Array<{
      definition?: { name?: string }
      subclassDefinition?: { name?: string }
      level?: number
      isStartingClass?: boolean
    }> = Array.isArray(data.classes) ? data.classes : []

    const classes = ddbClasses.map((c) => ({
      name: c.definition?.name ?? 'Unknown',
      level: c.level ?? 1,
      subclass: c.subclassDefinition?.name ?? undefined,
      hitDie: getHitDie(c.definition?.name ?? '')
    }))

    const totalLevel = classes.reduce((sum, c) => sum + c.level, 0) || 1

    // Extract species/race
    const speciesName: string = data.race?.fullName ?? data.race?.baseName ?? data.race?.raceName ?? 'Human'

    // Extract hit points
    const baseHP = data.baseHitPoints ?? 10
    const bonusHP = data.bonusHitPoints ?? 0
    const removedHP = data.removedHitPoints ?? 0
    const tempHP = data.temporaryHitPoints ?? 0
    const maxHP = baseHP + bonusHP
    const currentHP = maxHP - removedHP

    // Extract alignment
    const alignmentId = data.alignmentId
    const alignmentMap: Record<number, string> = {
      1: 'Lawful Good',
      2: 'Neutral Good',
      3: 'Chaotic Good',
      4: 'Lawful Neutral',
      5: 'True Neutral',
      6: 'Chaotic Neutral',
      7: 'Lawful Evil',
      8: 'Neutral Evil',
      9: 'Chaotic Evil'
    }
    const alignment = alignmentMap[alignmentId] ?? ''

    // Extract background
    const backgroundName: string = data.background?.definition?.name ?? data.background?.name ?? ''

    // Enhanced extraction
    const proficiencies = extractProficiencies(data.modifiers)
    const skills = extractSkills(data.modifiers)
    const { equipment, weapons, armor } = extractInventory(data)
    const { knownSpells, preparedSpellIds } = extractSpells(data)
    const feats = extractFeats(data)
    const classFeatures = extractClassFeatures(data)
    const raceFeatures = extractRaceFeatures(data)
    const defenses = extractDefenses(data, data.modifiers)

    // Death saves
    const deathSaves = {
      successes: data.deathSaves?.failCount ?? 0,
      failures: data.deathSaves?.successCount ?? 0
    }

    // Build our Character5e object
    const now = new Date().toISOString()
    const character: Character5e = {
      id: crypto.randomUUID(),
      gameSystem: 'dnd5e',
      campaignId: null,
      playerId: '',

      name: data.name,
      species: speciesName,
      classes,
      level: totalLevel,
      background: backgroundName,
      alignment,
      xp: data.currentXp ?? 0,
      levelingMode: 'milestone',

      abilityScores,
      hitPoints: { current: currentHP, maximum: maxHP, temporary: tempHP },
      hitDice: classes.map((cls) => ({ current: cls.level, maximum: cls.level, dieType: cls.hitDie })),
      armorClass: 10,
      initiative: 0,
      speed: defenses.speed,
      speeds: defenses.speeds,
      senses: defenses.senses,
      resistances: defenses.resistances,
      immunities: defenses.immunities,
      vulnerabilities: defenses.vulnerabilities,

      details: {
        gender: data.gender ?? undefined,
        age: data.age ? String(data.age) : undefined,
        height: data.height ?? undefined,
        weight: data.weight ? String(data.weight) : undefined,
        eyes: data.eyes ?? undefined,
        hair: data.hair ?? undefined,
        skin: data.skin ?? undefined,
        personality: data.traits?.personalityTraits ?? undefined,
        ideals: data.traits?.ideals ?? undefined,
        bonds: data.traits?.bonds ?? undefined,
        flaws: data.traits?.flaws ?? undefined
      },

      proficiencies,
      skills,

      equipment,
      treasure: {
        cp: data.currencies?.cp ?? 0,
        sp: data.currencies?.sp ?? 0,
        gp: data.currencies?.gp ?? 0,
        pp: data.currencies?.pp ?? 0,
        ep: data.currencies?.ep ?? 0
      },
      features: raceFeatures,
      knownSpells,
      preparedSpellIds,
      spellSlotLevels: {},
      classFeatures,
      weapons,
      armor,
      feats,

      buildChoices: {
        speciesId: speciesName.toLowerCase().replace(/\s+/g, '-'),
        classId: (classes[0]?.name ?? 'fighter').toLowerCase(),
        subclassId: classes[0]?.subclass?.toLowerCase().replace(/\s+/g, '-'),
        backgroundId: backgroundName.toLowerCase().replace(/\s+/g, '-'),
        selectedSkills: skills.filter((s) => s.proficient).map((s) => s.name),
        abilityScoreMethod: 'custom',
        abilityScoreAssignments: {}
      },

      status: 'active',
      campaignHistory: [],
      backstory: data.notes?.backstory ?? '',
      notes: '',
      pets: [],
      deathSaves,
      heroicInspiration: data.inspiration ?? false,
      attunement: [],
      conditions: [],
      languageDescriptions: {},
      createdAt: now,
      updatedAt: now
    }

    return character
  } catch (err) {
    logger.error('Import D&D Beyond character failed:', err)
    return null
  }
}
