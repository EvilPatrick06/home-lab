import { getClassResources } from '../../data/class-resources'
import { getSpeciesResources } from '../../data/species-resources'
import {
  computeSpellcastingInfo,
  FULL_CASTERS_5E,
  getMulticlassSpellSlots,
  getSlotProgression,
  getWarlockPactSlots,
  HALF_CASTERS_5E,
  isMulticlassSpellcaster
} from '../../services/character/spell-data'
import { calculateHPBonusFromTraits, getWildShapeMax } from '../../services/character/stat-calculator-5e'
import { load5eClasses, load5eClassFeatures, load5eSpells } from '../../services/data-provider'
import type { Character5e, MulticlassEntry } from '../../types/character-5e'
import type { AbilityName, AbilityScoreSet } from '../../types/character-common'
import { abilityModifier } from '../../types/character-common'
import { resolveLevelUpSpells, toSpellEntry } from './level-up-spells'
import type { HpChoice } from './types'

export async function apply5eLevelUp(
  character: Character5e,
  currentLevel: number,
  targetLevel: number,
  hpChoices: Record<number, HpChoice>,
  hpRolls: Record<number, number>,
  asiSelections: Record<string, AbilityName[]>,
  newSpellIds: string[],
  epicBoonSelection: { id: string; name: string; description: string } | null,
  classLevelChoices: Record<number, string>,
  generalFeatSelections: Record<
    string,
    { id: string; name: string; description: string; choices?: Record<string, string | string[]> }
  >,
  fightingStyleSelection: { id: string; name: string; description: string } | null,
  primalOrderSelection: 'magician' | 'warden' | null,
  divineOrderSelection: 'protector' | 'thaumaturge' | null,
  elementalFurySelection: 'potent-spellcasting' | 'primal-strike' | null,
  invocationSelections: string[],
  metamagicSelections: string[],
  blessedWarriorCantrips: string[],
  druidicWarriorCantrips: string[],
  expertiseSelections: Record<string, string[]>
): Promise<Character5e> {
  // Load class data for hit dice and names
  const classDataMap: Record<
    string,
    {
      name: string
      hitDie: number
      multiclassing?: {
        hitPointDie?: boolean
        weaponProficiencies?: Array<{ category?: string }>
        armorTraining?: string[]
      }
    }
  > = {}
  try {
    const classes = await load5eClasses()
    for (const cls of classes) {
      classDataMap[cls.id ?? cls.name.toLowerCase()] = {
        name: cls.name,
        hitDie: parseInt(cls.coreTraits.hitPointDie.replace(/\D/g, ''), 10),
        multiclassing: cls.multiclassing
      }
    }
  } catch {
    /* ignore */
  }

  const primaryClassId = character.buildChoices.classId
  const defaultHitDie = character.classes[0]?.hitDie ?? 8

  // 1. Process ASI first to update ability scores
  const updatedScores: AbilityScoreSet = { ...character.abilityScores }
  const oldConMod = abilityModifier(character.abilityScores.constitution)

  for (const [slotId, abilities] of Object.entries(asiSelections)) {
    if (generalFeatSelections[slotId]) continue
    for (const ability of abilities) {
      updatedScores[ability] = Math.min(20, updatedScores[ability] + 1)
    }
  }

  const newConMod = abilityModifier(updatedScores.constitution)

  // 2. Calculate HP gain per new level
  let hpGain = 0
  for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
    const levelClassId = classLevelChoices[lvl] ?? primaryClassId
    const hitDie = classDataMap[levelClassId]?.hitDie ?? defaultHitDie
    let dieResult: number
    if (hpChoices[lvl] === 'roll' && hpRolls[lvl] !== undefined) {
      dieResult = hpRolls[lvl]
    } else {
      dieResult = Math.floor(hitDie / 2) + 1
    }
    hpGain += Math.max(1, dieResult + newConMod)
  }

  // 3. Retroactive CON bonus
  const retroactiveBonus = (newConMod - oldConMod) * currentLevel

  // 3b. HP bonus from species traits and feats
  const existingFeats = character.feats ?? []
  const newToughSelected = Object.values(generalFeatSelections).some((f) => f.id === 'tough')
  const featsForHP =
    newToughSelected && !existingFeats.some((f) => f.id === 'tough')
      ? [...existingFeats, { id: 'tough' }]
      : existingFeats
  const isDraconicSorcerer = character.classes.some(
    (c) => c.name.toLowerCase() === 'sorcerer' && c.subclass?.toLowerCase().replace(/\s+/g, '-') === 'draconic-sorcery'
  )
  const oldSorcererLevel = isDraconicSorcerer
    ? (character.classes.find((c) => c.name.toLowerCase() === 'sorcerer')?.level ?? 0)
    : 0
  let newSorcererLevels = 0
  if (isDraconicSorcerer) {
    for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
      if ((classLevelChoices[lvl] ?? primaryClassId) === 'sorcerer') newSorcererLevels++
    }
  }
  const newSorcererLevel = oldSorcererLevel + newSorcererLevels

  const oldTraitBonus = calculateHPBonusFromTraits(
    currentLevel,
    character.buildChoices.speciesId,
    existingFeats,
    isDraconicSorcerer ? oldSorcererLevel : undefined
  )
  const newTraitBonus = calculateHPBonusFromTraits(
    targetLevel,
    character.buildChoices.speciesId,
    featsForHP,
    isDraconicSorcerer ? newSorcererLevel : undefined
  )
  const traitBonusDelta = newTraitBonus - oldTraitBonus

  // 4. Calculate new HP
  const newMaxHP = character.hitPoints.maximum + hpGain + retroactiveBonus + traitBonusDelta
  const damageTaken = character.hitPoints.maximum - character.hitPoints.current
  const newCurrentHP = Math.max(1, newMaxHP - damageTaken)

  // 5. Update classes array
  const updatedClasses = character.classes.map((c) => ({ ...c }))
  const newClassesAdded: string[] = []

  for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
    const levelClassId = classLevelChoices[lvl] ?? primaryClassId
    const existingIdx = updatedClasses.findIndex((c) => c.name.toLowerCase() === levelClassId)
    if (existingIdx >= 0) {
      updatedClasses[existingIdx] = { ...updatedClasses[existingIdx], level: updatedClasses[existingIdx].level + 1 }
    } else {
      const classInfo = classDataMap[levelClassId]
      updatedClasses.push({
        name: classInfo?.name ?? levelClassId,
        level: 1,
        hitDie: classInfo?.hitDie ?? 8
      })
      newClassesAdded.push(levelClassId)
    }
  }

  // 6. Load class features for new levels
  const allNewFeatures: Array<{ level: number; name: string; description: string; source: string }> = []
  try {
    const cfData = await load5eClassFeatures()
    const classLvlTracker: Record<string, number> = {}
    for (const cls of character.classes) {
      classLvlTracker[cls.name.toLowerCase()] = cls.level
    }
    for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
      const levelClassId = classLevelChoices[lvl] ?? primaryClassId
      classLvlTracker[levelClassId] = (classLvlTracker[levelClassId] ?? 0) + 1
      const classLevel = classLvlTracker[levelClassId]
      const classCF = cfData[levelClassId]
      if (classCF) {
        const levelFeatures = classCF.features.filter((f) => f.level === classLevel)
        allNewFeatures.push(
          ...levelFeatures.map((f) => ({
            level: lvl,
            name: f.name,
            description: f.description,
            source: classDataMap[levelClassId]?.name ?? levelClassId
          }))
        )
      }
    }
  } catch {
    /* ignore */
  }

  // 7. Load new spells (delegated to helper)
  const newSpells = await resolveLevelUpSpells(
    character,
    targetLevel,
    newSpellIds,
    fightingStyleSelection,
    blessedWarriorCantrips,
    druidicWarriorCantrips
  )

  // 8. Update spell slot progression (multiclass-aware)
  const classesForSlots = updatedClasses.map((c) => ({
    classId: c.name.toLowerCase(),
    subclassId: c.subclass?.toLowerCase(),
    level: c.level
  }))

  const useMulticlassTable = isMulticlassSpellcaster(classesForSlots)
  let newSlotProg: Record<number, number>
  if (useMulticlassTable) {
    newSlotProg = getMulticlassSpellSlots(classesForSlots)
  } else {
    const casterClass = updatedClasses.find((c) => {
      const id = c.name.toLowerCase()
      return [...FULL_CASTERS_5E, ...HALF_CASTERS_5E].includes(id)
    })
    if (casterClass) {
      newSlotProg = getSlotProgression(casterClass.name.toLowerCase(), casterClass.level)
    } else {
      newSlotProg = {}
    }
  }

  // Handle Warlock Pact Magic slots
  const warlockPactSlots = getWarlockPactSlots(classesForSlots)
  const hasNonWarlockCasting = classesForSlots.some(
    (c) => c.classId !== 'warlock' && (FULL_CASTERS_5E.includes(c.classId) || HALF_CASTERS_5E.includes(c.classId))
  )

  if (Object.keys(warlockPactSlots).length > 0 && !hasNonWarlockCasting) {
    newSlotProg = warlockPactSlots
  }

  const updatedSlotLevels: Record<number, { current: number; max: number }> = {}
  for (const [lvlStr, max] of Object.entries(newSlotProg)) {
    const lvl = Number(lvlStr)
    const existing = character.spellSlotLevels?.[lvl]
    if (existing) {
      const gained = max - existing.max
      updatedSlotLevels[lvl] = { current: existing.current + Math.max(0, gained), max }
    } else {
      updatedSlotLevels[lvl] = { current: max, max }
    }
  }

  // Build pact magic slot levels for multiclass warlock + other casters
  let updatedPactSlotLevels: Record<number, { current: number; max: number }> | undefined
  if (hasNonWarlockCasting && Object.keys(warlockPactSlots).length > 0) {
    updatedPactSlotLevels = {}
    for (const [lvlStr, max] of Object.entries(warlockPactSlots)) {
      const lvl = Number(lvlStr)
      const existing = character.pactMagicSlotLevels?.[lvl]
      if (existing) {
        const gained = max - existing.max
        updatedPactSlotLevels[lvl] = { current: existing.current + Math.max(0, gained), max }
      } else {
        updatedPactSlotLevels[lvl] = { current: max, max }
      }
    }
  }

  // 9. Merge ASI choices
  const existingAsi = character.buildChoices.asiChoices ?? {}
  const mergedAsi = { ...existingAsi }
  for (const [slotId, abilities] of Object.entries(asiSelections)) {
    mergedAsi[slotId] = abilities
  }

  // 10. Update class features
  const mergedClassFeatures = [
    ...(character.classFeatures ?? []),
    ...allNewFeatures.map((f) => ({
      level: f.level,
      name: f.name,
      source: f.source,
      description: f.description
    }))
  ]

  // 11. Add feats
  const updatedFeats = [...(character.feats ?? [])]
  if (epicBoonSelection) updatedFeats.push(epicBoonSelection)
  for (const feat of Object.values(generalFeatSelections)) updatedFeats.push(feat)
  if (fightingStyleSelection) updatedFeats.push(fightingStyleSelection)

  // 12. Add multiclass proficiencies
  let updatedProficiencies = { ...character.proficiencies }
  for (const newClassId of newClassesAdded) {
    const mcProfs = classDataMap[newClassId]?.multiclassing
    if (mcProfs) {
      updatedProficiencies = {
        ...updatedProficiencies,
        armor: [...new Set([...updatedProficiencies.armor, ...(mcProfs.armorTraining ?? [])])],
        weapons: [
          ...new Set([
            ...updatedProficiencies.weapons,
            ...(mcProfs.weaponProficiencies ?? []).map((w) => w.category ?? '').filter(Boolean)
          ])
        ]
      }
    }
  }

  if (primalOrderSelection === 'warden') {
    updatedProficiencies = {
      ...updatedProficiencies,
      armor: [...new Set([...updatedProficiencies.armor, 'Medium armor'])],
      weapons: [...new Set([...updatedProficiencies.weapons, 'Martial weapons'])]
    }
  }
  if (divineOrderSelection === 'protector') {
    updatedProficiencies = {
      ...updatedProficiencies,
      armor: [...new Set([...updatedProficiencies.armor, 'Heavy armor'])],
      weapons: [...new Set([...updatedProficiencies.weapons, 'Martial weapons'])]
    }
  }

  // Auto-grant Druidic language
  let updatedLanguages = [...updatedProficiencies.languages]
  if (newClassesAdded.includes('druid') && !updatedLanguages.includes('Druidic')) {
    updatedLanguages = [...updatedLanguages, 'Druidic']
    updatedProficiencies = { ...updatedProficiencies, languages: updatedLanguages }
  }

  // Recalculate Wild Shape uses
  const druidClass = updatedClasses.find((c) => c.name.toLowerCase() === 'druid')
  const newWildShapeMax = druidClass ? getWildShapeMax(druidClass.level) : 0
  const updatedWildShapeUses =
    newWildShapeMax > 0
      ? {
          current: Math.min(
            newWildShapeMax,
            (character.wildShapeUses?.current ?? 0) + Math.max(0, newWildShapeMax - (character.wildShapeUses?.max ?? 0))
          ),
          max: newWildShapeMax
        }
      : character.wildShapeUses

  // Ensure always-prepared class spells
  const updatedKnownSpells = [...character.knownSpells, ...newSpells]
  const rangerClass = updatedClasses.find((c) => c.name.toLowerCase() === 'ranger')
  const alwaysPreparedClassSpells: Array<{ spellName: string; classRef: unknown }> = [
    { spellName: 'Speak with Animals', classRef: druidClass },
    { spellName: "Hunter's Mark", classRef: rangerClass }
  ]
  for (const { spellName, classRef } of alwaysPreparedClassSpells) {
    if (classRef && !updatedKnownSpells.some((s) => s.name === spellName)) {
      try {
        const spellData = await load5eSpells()
        const found = spellData.find((s) => s.name === spellName)
        if (found) {
          updatedKnownSpells.push(toSpellEntry(found, { prepared: true, source: 'class' }))
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 13. Track multiclass entries
  const multiclassEntries: MulticlassEntry[] = [...(character.buildChoices.multiclassEntries ?? [])]
  for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
    const levelClassId = classLevelChoices[lvl] ?? primaryClassId
    if (levelClassId !== primaryClassId) {
      multiclassEntries.push({ classId: levelClassId, levelTaken: lvl })
    }
  }

  // 14. Recompute spellcasting info
  const spellcastingClasses = updatedClasses.map((c) => ({
    classId: c.name.toLowerCase(),
    subclassId: c.subclass?.toLowerCase(),
    level: c.level
  }))
  const spellcastingInfo = computeSpellcastingInfo(
    spellcastingClasses,
    updatedScores,
    targetLevel,
    character.buildChoices.classId,
    character.buildChoices.subclassId
  )

  // 15. Apply expertise
  const updatedSkills = character.skills.map((s) => ({ ...s }))
  const mergedExpertiseChoices = { ...character.buildChoices.expertiseChoices }
  for (const [slotId, skillNames] of Object.entries(expertiseSelections)) {
    mergedExpertiseChoices[slotId] = skillNames
    for (const skillName of skillNames) {
      const skill = updatedSkills.find((s) => s.name === skillName)
      if (skill) skill.expertise = true
    }
  }

  const updated: Character5e = {
    ...character,
    level: targetLevel,
    classes: updatedClasses,
    abilityScores: updatedScores,
    hitPoints: { current: newCurrentHP, maximum: newMaxHP, temporary: character.hitPoints.temporary },
    hitDice: (() => {
      const levelsGained = targetLevel - currentLevel
      const classIdx = character.hitDice.findIndex(
        (hd) => hd.dieType === (updatedClasses.find((c) => c.name.toLowerCase() === primaryClassId)?.hitDie ?? 8)
      )
      if (classIdx >= 0) {
        return character.hitDice.map((hd, i) =>
          i === classIdx ? { ...hd, current: hd.current + levelsGained, maximum: hd.maximum + levelsGained } : hd
        )
      }
      const newDie = updatedClasses.find((c) => c.name.toLowerCase() === primaryClassId)?.hitDie ?? 8
      return [...character.hitDice, { current: levelsGained, maximum: levelsGained, dieType: newDie }]
    })(),
    proficiencies: updatedProficiencies,
    spellcasting: spellcastingInfo,
    knownSpells: updatedKnownSpells,
    spellSlotLevels: updatedSlotLevels,
    ...(updatedPactSlotLevels ? { pactMagicSlotLevels: updatedPactSlotLevels } : {}),
    classFeatures: mergedClassFeatures,
    feats: updatedFeats,
    wildShapeUses: updatedWildShapeUses,
    classResources: (() => {
      const wisMod = Math.floor((updatedScores.wisdom - 10) / 2)
      const newResources = getClassResources(
        primaryClassId,
        updatedClasses.find((c) => c.name.toLowerCase() === primaryClassId)?.level ?? targetLevel,
        wisMod
      )
      if (newResources.length === 0) return character.classResources
      const oldResources = character.classResources ?? []
      return newResources.map((nr) => {
        const old = oldResources.find((or) => or.id === nr.id)
        if (old && old.max === nr.max) return { ...nr, current: old.current }
        if (old) {
          const gained = nr.max - old.max
          return { ...nr, current: Math.min(nr.max, old.current + Math.max(0, gained)) }
        }
        return nr
      })
    })(),
    speciesResources: (() => {
      const newResources = getSpeciesResources(
        character.buildChoices.speciesId,
        character.buildChoices.subspeciesId,
        targetLevel
      )
      if (newResources.length === 0) return character.speciesResources
      const oldResources = character.speciesResources ?? []
      return newResources.map((nr) => {
        const old = oldResources.find((or) => or.id === nr.id)
        if (old && old.max === nr.max) return { ...nr, current: old.current }
        if (old) {
          const gained = nr.max - old.max
          return { ...nr, current: Math.min(nr.max, old.current + Math.max(0, gained)) }
        }
        return nr
      })
    })(),
    buildChoices: {
      ...character.buildChoices,
      asiChoices: Object.keys(mergedAsi).length > 0 ? mergedAsi : undefined,
      multiclassEntries: multiclassEntries.length > 0 ? multiclassEntries : undefined,
      ...(epicBoonSelection ? { epicBoonId: epicBoonSelection.id } : {}),
      ...(Object.keys(generalFeatSelections).length > 0
        ? {
            generalFeatChoices: Object.fromEntries(
              Object.entries(generalFeatSelections).map(([slotId, feat]) => [slotId, feat.id])
            )
          }
        : {}),
      ...(fightingStyleSelection ? { fightingStyleId: fightingStyleSelection.id } : {}),
      ...(blessedWarriorCantrips.length > 0 ? { blessedWarriorCantrips } : {}),
      ...(druidicWarriorCantrips.length > 0 ? { druidicWarriorCantrips } : {}),
      ...(primalOrderSelection ? { primalOrderChoice: primalOrderSelection } : {}),
      ...(divineOrderSelection ? { divineOrderChoice: divineOrderSelection } : {}),
      ...(elementalFurySelection ? { elementalFuryChoice: elementalFurySelection } : {}),
      ...(Object.keys(mergedExpertiseChoices).length > 0 ? { expertiseChoices: mergedExpertiseChoices } : {})
    },
    skills: updatedSkills,
    invocationsKnown: invocationSelections.length > 0 ? invocationSelections : undefined,
    metamagicKnown: metamagicSelections.length > 0 ? metamagicSelections : undefined,
    ...(() => {
      const rangerLevel = updatedClasses.find((c) => c.name.toLowerCase() === 'ranger')?.level ?? 0
      if (rangerLevel >= 6) {
        const baseSpeed = character.speed
        const prevRangerLevel = character.classes.find((c) => c.name.toLowerCase() === 'ranger')?.level ?? 0
        const newSpeed = prevRangerLevel < 6 ? baseSpeed + 10 : baseSpeed
        return {
          speed: newSpeed,
          speeds: { ...(character.speeds ?? { swim: 0, fly: 0, climb: 0, burrow: 0 }), climb: newSpeed, swim: newSpeed }
        }
      }
      return {}
    })(),
    updatedAt: new Date().toISOString()
  }

  return updated
}
