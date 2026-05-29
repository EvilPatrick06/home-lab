/**
 * D&D Beyond character import.
 * Converts a DDB JSON export to our Character5e format.
 *
 * Extracts: ability scores, classes, species, HP, alignment, background,
 * proficiencies, skills, equipment, weapons, armor, spells, feats,
 * class features, speed, senses, resistances, immunities, death saves.
 */

import type { Character5e, Character5eV3 } from '../../types/character-5e'
import { migrateCharacter5eFromV3ToV4 } from '../../types/character-5e-migration'
import { logger } from '../../utils/logger'
import { applyAbilityBonuses, extractAbilityScores, getHitDie } from './import-dnd-beyond/ability-scores'
import { extractDefenses } from './import-dnd-beyond/defenses'
import { extractClassFeatures, extractFeats, extractRaceFeatures } from './import-dnd-beyond/features'
import { extractInventory } from './import-dnd-beyond/inventory'
import { extractProficiencies, extractSkills } from './import-dnd-beyond/proficiencies'
import { extractSpells } from './import-dnd-beyond/spells'

const JSON_FILTER = [{ name: 'JSON Files', extensions: ['json'] }]

// ---------------------------------------------------------------------------
// Main import function
//
// Per-section mappers live in ./import-dnd-beyond/*; this module orchestrates
// them and assembles the final Character5e object.
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
    const character: Character5eV3 = {
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

    return migrateCharacter5eFromV3ToV4(character)
  } catch (err) {
    logger.error('Import D&D Beyond character failed:', err)
    return null
  }
}
