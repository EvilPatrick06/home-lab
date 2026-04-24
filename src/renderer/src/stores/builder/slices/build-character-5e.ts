import { getClassResources } from '../../../data/class-resources'
import { getSpeciesResources } from '../../../data/species-resources'
import { isWearableItem } from '../../../data/wearable-items'
import { populateSkills5e } from '../../../services/character/auto-populate-5e'
import { computeSpellcastingInfo, getSlotProgression } from '../../../services/character/spell-data'
import {
  calculate5eStats,
  calculateArmorClass5e,
  getWildShapeMax
} from '../../../services/character/stat-calculator-5e'
import {
  load5eBackgrounds,
  load5eClasses,
  load5eClassFeatures,
  load5eEquipment,
  load5eFeats,
  load5eMagicItems,
  load5eSpecies
} from '../../../services/data-provider'
import type { Character5e, MagicItemEntry5e } from '../../../types/character-5e'
import type { AbilityName } from '../../../types/character-common'
import type { MagicItemData } from '../../../types/data'
import { useCharacterStore } from '../../use-character-store'
import type { BuilderState } from '../types'
import { type BuilderSpellsInput, resolveBuilderSpells } from './builder-spells'

type _BuilderSpellsInput = BuilderSpellsInput

import { getSpeciesResistances, getSpeciesSenses } from './character-species-helpers'
import { buildArmorFromEquipment5e, buildWeaponsFromEquipment5e } from './save-slice-5e'

interface GearDataItem {
  name: string
  description?: string
  cost?: string
  price?: string
}

type GetState = () => BuilderState

export async function buildCharacter5e(get: GetState): Promise<Character5e> {
  const state = get()
  const {
    buildSlots,
    characterName,
    abilityScores,
    selectedSkills,
    targetLevel,
    abilityScoreMethod,
    editingCharacterId,
    iconType,
    iconPreset,
    iconCustom,
    pets,
    conditions,
    backgroundAbilityBonuses,
    selectedSpellIds,
    currentHP,
    tempHP,
    speciesSize,
    characterAlignment,
    speciesProficiencies,
    versatileFeatId,
    speciesSpellcastingAbility,
    keenSensesSkill,
    blessedWarriorCantrips,
    druidicWarriorCantrips
  } = state

  const speciesSlot = buildSlots.find((s) => s.category === 'ancestry')
  const classSlot = buildSlots.find((s) => s.category === 'class')
  const bgSlot = buildSlots.find((s) => s.category === 'background')

  const [speciesList, classes, backgrounds, featsData, cfData] = await Promise.all([
    load5eSpecies(),
    load5eClasses(),
    load5eBackgrounds(),
    load5eFeats().catch(() => [] as Awaited<ReturnType<typeof load5eFeats>>),
    load5eClassFeatures().catch((): Awaited<ReturnType<typeof load5eClassFeatures>> => ({}))
  ])

  const subclassSlot = buildSlots.find((s) => s.id.includes('subclass'))

  const speciesData = speciesList.find((r) => r.id === speciesSlot?.selectedId) ?? null
  const classData = classes.find((c) => c.id === classSlot?.selectedId) ?? null
  const bgData = backgrounds.find((b) => b.id === bgSlot?.selectedId) ?? null

  const speciesForCalc = speciesData
    ? {
        abilityBonuses: {} as Partial<Record<AbilityName, number>>,
        speed: speciesData.speed,
        size: speciesData.size.value ?? speciesData.size.options?.[0] ?? 'Medium'
      }
    : null
  const classForCalc = classData
    ? {
        hitDie: parseInt(classData.coreTraits.hitPointDie.replace(/\D/g, ''), 10) || 8,
        savingThrows: classData.coreTraits.savingThrowProficiencies
      }
    : null

  const speciesBonuses =
    Object.keys(backgroundAbilityBonuses).length > 0
      ? (backgroundAbilityBonuses as Partial<Record<AbilityName, number>>)
      : undefined

  let existingChar5e: Character5e | undefined
  if (editingCharacterId) {
    existingChar5e = useCharacterStore.getState().characters.find((c) => c.id === editingCharacterId) as
      | Character5e
      | undefined
  }

  const builderFeats = (existingChar5e?.feats ?? []).map((f) => ({ id: f.id }))
  const isDraconicForHP = classSlot?.selectedId === 'sorcerer' && subclassSlot?.selectedId === 'draconic-sorcery'
  const draconicSorcererLevelForHP = isDraconicForHP ? targetLevel : undefined

  const stats = calculate5eStats(
    abilityScores,
    speciesForCalc,
    classForCalc,
    targetLevel,
    speciesBonuses,
    speciesSlot?.selectedId,
    builderFeats,
    draconicSorcererLevelForHP
  )
  const now = new Date().toISOString()

  const classId = classSlot?.selectedId ?? ''
  const subclassId = subclassSlot?.selectedId ?? undefined
  const spellcastingInfo = computeSpellcastingInfo(
    [{ classId, subclassId, level: targetLevel }],
    stats.abilityScores,
    targetLevel,
    classId,
    subclassId
  )

  // Resolve origin feat from background
  let originFeat: { id: string; name: string; description: string } | null = null
  if (bgData?.feat) {
    const baseName = bgData.feat.replace(/\s*\(.*\)$/, '')
    const match = featsData.find((f) => f.name === baseName)
    if (match)
      originFeat = { id: match.id, name: bgData.feat, description: match.benefits.map((b) => b.description).join(' ') }
  }

  // Class features
  let creationClassFeatures: Array<{ level: number; name: string; source: string; description: string }> = []
  if (classData) {
    const classCF = cfData[classId]
    if (classCF) {
      creationClassFeatures = classCF.features
        .filter((f) => f.level >= 1 && f.level <= targetLevel)
        .map((f) => ({ level: f.level, name: f.name, source: classData.name, description: f.description }))
    }
  }

  // Gather all equipment
  const classEquipmentChoice = state.classEquipmentChoice || 'A'
  const classEqEntries = classData?.coreTraits.startingEquipment ?? []
  const chosenEntry = classEqEntries.find((e) => e.label === classEquipmentChoice) ?? classEqEntries[0]
  const startingEquipment = (chosenEntry?.items ?? []).map((name) => ({ name, quantity: 1 }))
  const classOptionGold = chosenEntry?.gp ?? 0
  const bgEquipmentChoice = state.backgroundEquipmentChoice ?? 'equipment'
  const storeBgEquipment = state.bgEquipment
  const bgEquipment =
    bgEquipmentChoice === 'gold'
      ? []
      : storeBgEquipment.length > 0
        ? storeBgEquipment.flatMap((e) => e.items.map((item) => ({ name: item, quantity: 1 })))
        : (bgData?.equipment?.[0]?.items ?? []).map((item) => ({ name: item, quantity: 1 }))
  const shopEquipment = state.classEquipment.filter((e) => e.source === 'shop' || e.source === 'trinket')
  const allEquipment = [
    ...startingEquipment.map((e: { name: string; quantity: number }) => ({ ...e, source: 'class' })),
    ...bgEquipment.map((e) => ({ ...e, source: 'background' })),
    ...shopEquipment.map((e) => ({ name: e.name, quantity: e.quantity, source: 'shop' }))
  ]

  // Build weapons and armor
  const weaponBuildResult = editingCharacterId
    ? {
        weapons: existingChar5e?.weapons ?? [],
        matchedNames: new Set(existingChar5e?.weapons?.map((w) => w.name) ?? [])
      }
    : await buildWeaponsFromEquipment5e(allEquipment)
  const armorBuildResult = await buildArmorFromEquipment5e(allEquipment)

  // Build wearable items
  const eqDataForGear = await load5eEquipment().catch(() => null)
  const gearData: GearDataItem[] = eqDataForGear?.gear ?? []
  const wearableArmor: import('../../../types/character-common').ArmorEntry[] = []
  const wearableMatchedNames = new Set<string>()
  for (const item of allEquipment) {
    if (weaponBuildResult.matchedNames.has(item.name)) continue
    if (armorBuildResult.matchedNames.has(item.name)) continue
    if (isWearableItem(item.name)) {
      wearableMatchedNames.add(item.name)
      const gearMatch = gearData.find((g) => g.name.toLowerCase() === item.name.toLowerCase())
      wearableArmor.push({
        id: crypto.randomUUID(),
        name: item.name,
        acBonus: 0,
        equipped: false,
        type: 'clothing',
        description: gearMatch?.description
      })
    }
  }

  const excludedNames = new Set([
    ...weaponBuildResult.matchedNames,
    ...armorBuildResult.matchedNames,
    ...wearableMatchedNames
  ])
  const filteredEquipment = allEquipment
    .filter((item) => !excludedNames.has(item.name))
    .map((item) => {
      const gearMatch = gearData.find((g) => g.name.toLowerCase() === item.name.toLowerCase())
      return { ...item, description: gearMatch?.description }
    })

  // Resolve magic items
  const selectedMagicItemEntries = state.selectedMagicItems
  let magicItems: MagicItemEntry5e[] = existingChar5e?.magicItems ?? []
  if (selectedMagicItemEntries.some((m) => m.itemId)) {
    const allMagicItemData = await load5eMagicItems().catch(() => [] as MagicItemData[])
    magicItems = selectedMagicItemEntries
      .filter((m) => m.itemId)
      .map((m) => {
        const data = allMagicItemData.find((d) => d.id === m.itemId)
        return {
          id: m.itemId,
          name: data?.name ?? m.itemName,
          rarity: (data?.rarity ?? m.slotRarity) as MagicItemEntry5e['rarity'],
          type: data?.type ?? 'wondrous',
          attunement: data?.attunement ?? false,
          description: data?.description ?? ''
        }
      })
  }

  // Pre-compute heritage-dependent values
  const heritageSlot = buildSlots.find((s) => s.id === 'heritage')
  const heritageId = heritageSlot?.selectedId ?? null
  const heritageSubId = heritageId ?? existingChar5e?.buildChoices?.subspeciesId
  const computedSenses = [
    ...new Set([...getSpeciesSenses(speciesSlot?.selectedId ?? '', heritageSubId), ...(existingChar5e?.senses ?? [])])
  ]
  const computedResistances = [
    ...new Set([
      ...getSpeciesResistances(speciesSlot?.selectedId ?? '', heritageSubId),
      ...(existingChar5e?.resistances ?? [])
    ])
  ]
  const isRanger6 = classId === 'ranger' && targetLevel >= 6
  const baseSpeed = state.speciesSpeed || stats.speed
  const computedSpeed = isRanger6 ? baseSpeed + 10 : baseSpeed
  const computedSpeeds = (() => {
    const existing = existingChar5e?.speeds ?? { swim: 0, fly: 0, climb: 0, burrow: 0 }
    if (isRanger6) {
      const ws = baseSpeed + 10
      return { ...existing, climb: Math.max(existing.climb, ws), swim: Math.max(existing.swim, ws) }
    }
    return existing
  })()
  const computedSubspecies = heritageSlot?.selectedName ?? existingChar5e?.subspecies ?? undefined

  // Pre-compute proficiencies
  const primalOrderSlot = buildSlots.find((s) => s.category === 'primal-order')
  const divineOrderSlot = buildSlots.find((s) => s.category === 'divine-order')
  const isWarden = primalOrderSlot?.selectedId === 'warden'
  const isProtector = divineOrderSlot?.selectedId === 'protector'
  const weaponProfs = (() => {
    const r = (classData?.coreTraits.weaponProficiencies ?? []).map((w) => w.category ?? '').filter(Boolean)
    if ((isWarden || isProtector) && !r.includes('Martial')) r.push('Martial')
    return r
  })()
  const armorProfs = (() => {
    const r = [...(classData?.coreTraits.armorTraining ?? [])]
    if (isWarden && !r.includes('Medium')) r.push('Medium')
    if (isProtector && !r.includes('Heavy')) r.push('Heavy')
    return r
  })()
  const toolProfs = (() => {
    const bgToolsRaw = bgData?.toolProficiency ? [bgData.toolProficiency] : []
    const bgItems = storeBgEquipment.flatMap((e) => e.items)
    const bgToolsMapped = bgToolsRaw.map((tool) => {
      const toolLC = tool.toLowerCase()
      const matchedItem = bgItems.find((item) => item.toLowerCase() !== toolLC && item.toLowerCase().includes(toolLC))
      return matchedItem ?? tool
    })
    const all = [...bgToolsMapped]
    const seen = new Set<string>()
    return all.filter((t) => {
      const key = t.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()
  const chosenLangs = state.chosenLanguages
  const langProfs = [
    ...chosenLangs,
    ...(classId === 'druid' && !chosenLangs.includes('Druidic') ? ['Druidic'] : []),
    ...(classId === 'rogue' && !chosenLangs.includes("Thieves' Cant") ? ["Thieves' Cant"] : [])
  ]
  const mergedExpertiseChoices = {
    ...existingChar5e?.buildChoices?.expertiseChoices,
    ...state.builderExpertiseSelections
  }
  const computedSkills = (() => {
    const skills = populateSkills5e([
      ...new Set([
        ...selectedSkills,
        ...(bgData?.skillProficiencies ?? []),
        ...speciesProficiencies,
        ...(keenSensesSkill ? [keenSensesSkill] : [])
      ])
    ])
    for (const skillNames of Object.values(mergedExpertiseChoices)) {
      for (const skillName of skillNames) {
        const skill = skills.find((s) => s.name === skillName)
        if (skill) skill.expertise = true
      }
    }
    return skills
  })()

  // Pre-compute feats
  const computedFeats = (() => {
    let result = existingChar5e?.feats ?? []
    if (originFeat) {
      const withoutOldOrigin = result.filter((f) => {
        const baseName = f.name.replace(/\s*\(.*\)$/, '')
        return !featsData.some((fd) => fd.name === baseName && fd.category === 'Origin')
      })
      result = withoutOldOrigin.some((f) => f.name === originFeat.name)
        ? withoutOldOrigin
        : [originFeat, ...withoutOldOrigin]
    }
    const epicBoonSlot = buildSlots.find((s) => s.category === 'epic-boon' && s.selectedId)
    if (epicBoonSlot) {
      result = result.filter((f) => f.id !== existingChar5e?.buildChoices?.epicBoonId)
      const boonFeat = featsData.find((fd) => fd.id === epicBoonSlot.selectedId)
      result = boonFeat
        ? [
            ...result,
            { id: boonFeat.id, name: boonFeat.name, description: boonFeat.benefits.map((b) => b.description).join(' ') }
          ]
        : [...result, { id: epicBoonSlot.selectedId!, name: epicBoonSlot.selectedName ?? 'Epic Boon', description: '' }]
    }
    if (versatileFeatId) {
      result = result.filter((f) => f.id !== existingChar5e?.buildChoices?.versatileFeatId)
      const vFeat = featsData.find((fd) => fd.id === versatileFeatId)
      if (vFeat)
        result = [
          ...result,
          { id: vFeat.id, name: vFeat.name, description: vFeat.benefits.map((b) => b.description).join(' ') }
        ]
    } else if (existingChar5e?.buildChoices?.versatileFeatId) {
      result = result.filter((f) => f.id !== existingChar5e?.buildChoices?.versatileFeatId)
    }
    const fsSlot = buildSlots.find((s) => s.category === 'fighting-style' && s.selectedId)
    if (fsSlot) {
      result = result.filter((f) => f.id !== existingChar5e?.buildChoices?.fightingStyleId)
      const fsFeat = featsData.find((fd) => fd.id === fsSlot.selectedId)
      result = fsFeat
        ? [
            ...result,
            { id: fsFeat.id, name: fsFeat.name, description: fsFeat.benefits.map((b) => b.description).join(' ') }
          ]
        : [...result, { id: fsSlot.selectedId!, name: fsSlot.selectedName ?? 'Fighting Style', description: '' }]
    }
    // Merge builder feat selections (from ASI-or-Feat choices)
    for (const feat of Object.values(state.builderFeatSelections)) {
      if (!result.some((f) => f.id === feat.id)) {
        result.push(feat)
      }
    }
    return result
  })()

  // Pre-compute resource/feature values
  const computedWildShapeUses =
    classId === 'druid' && targetLevel >= 2
      ? {
          current: existingChar5e?.wildShapeUses?.current ?? getWildShapeMax(targetLevel),
          max: getWildShapeMax(targetLevel)
        }
      : undefined
  const wisMod = Math.floor((stats.abilityScores.wisdom - 10) / 2)
  const computedClassResources = (() => {
    const resources = getClassResources(classSlot?.selectedId ?? '', targetLevel, wisMod)
    return resources.length > 0 ? resources : existingChar5e?.classResources
  })()
  const computedSpeciesResources = (() => {
    const resources = getSpeciesResources(speciesSlot?.selectedId ?? '', heritageSubId, targetLevel)
    if (resources.length === 0) return existingChar5e?.speciesResources
    const oldResources = existingChar5e?.speciesResources ?? []
    return resources.map((nr) => {
      const old = oldResources.find((or) => or.id === nr.id)
      return old ? { ...nr, current: Math.min(nr.max, old.current) } : nr
    })
  })()
  const computedSpellSlotLevels =
    existingChar5e?.spellSlotLevels ??
    (() => {
      const slotProg = getSlotProgression(classId, targetLevel)
      const slots: Record<number, { current: number; max: number }> = {}
      for (const [lvl, count] of Object.entries(slotProg)) slots[Number(lvl)] = { current: count, max: count }
      return slots
    })()
  const computedClassFeatures =
    editingCharacterId && existingChar5e?.classFeatures?.length
      ? [
          ...existingChar5e.classFeatures,
          ...creationClassFeatures.filter(
            (f) =>
              !new Set(existingChar5e.classFeatures.map((ef) => `${ef.level}-${ef.name}`)).has(`${f.level}-${f.name}`)
          )
        ]
      : creationClassFeatures
  const computedPrimalOrder =
    (primalOrderSlot?.selectedId as 'magician' | 'warden') ??
    existingChar5e?.buildChoices?.primalOrderChoice ??
    undefined
  const computedDivineOrder =
    (divineOrderSlot?.selectedId as 'protector' | 'thaumaturge') ??
    existingChar5e?.buildChoices?.divineOrderChoice ??
    undefined

  // Pre-compute details — merge builder fields with existing character details
  const ed = existingChar5e?.details
  const detailPairs: [string, string | undefined][] = [
    ['gender', state.characterGender],
    ['deity', state.characterDeity],
    ['age', state.characterAge],
    ['height', state.characterHeight],
    ['weight', state.characterWeight],
    ['eyes', state.characterEyes],
    ['hair', state.characterHair],
    ['skin', state.characterSkin],
    ['appearance', state.characterAppearance],
    ['personality', state.characterPersonality],
    ['ideals', state.characterIdeals],
    ['bonds', state.characterBonds],
    ['flaws', state.characterFlaws]
  ]
  const computedDetails = Object.fromEntries(
    detailPairs.map(([k, v]) => [k, v || ed?.[k as keyof typeof ed] || undefined])
  ) as Record<string, string | undefined>

  // Carry over optional fields from existing character
  const ec = existingChar5e
  const existingCharCarryOver = Object.fromEntries(
    (
      [
        'pactMagicSlotLevels',
        'invocationsKnown',
        'metamagicKnown',
        'weaponMasteryChoices',
        'companions',
        'activeWildShapeFormId'
      ] as const
    )
      .filter((k) => ec?.[k] != null)
      .map((k) => [k, ec![k]])
  )

  // Resolve spells using extracted helper
  const knownSpells = await resolveBuilderSpells({
    classId,
    subclassId,
    targetLevel,
    selectedSpellIds,
    blessedWarriorCantrips,
    druidicWarriorCantrips,
    speciesData,
    derivedSpeciesTraits: state.derivedSpeciesTraits as Array<{
      name: string
      description: string
      spellGranted?: string | { list: string; count: number }
    }>,
    heritageId
  })

  const character: Character5e = {
    id: editingCharacterId ?? crypto.randomUUID(),
    gameSystem: 'dnd5e',
    campaignId: existingChar5e?.campaignId ?? null,
    playerId: existingChar5e?.playerId ?? 'local',
    name: characterName || 'Unnamed Character',
    species: speciesData?.name ?? 'Unknown',
    subspecies: computedSubspecies,
    classes: (() => {
      const clc = state.classLevelChoices
      const hasMulticlass = Object.keys(clc).length > 0 && Object.values(clc).some((cid) => cid !== classId)
      if (hasMulticlass && classData) {
        // Count levels per class (level 1 is always primary class)
        const levelCounts: Record<string, number> = { [classId]: 1 }
        for (const cid of Object.values(clc)) {
          levelCounts[cid] = (levelCounts[cid] ?? 0) + 1
        }
        return Object.entries(levelCounts).map(([cid, lvlCount]) => {
          const cd = classes.find((c) => c.id === cid)
          const subSlot = buildSlots.find(
            (s) => s.id.includes('subclass') && (s.id.includes(cid) || (cid === classId && !s.id.includes('-')))
          )
          return {
            name: cd?.name ?? cid,
            level: lvlCount,
            hitDie: parseInt(cd?.coreTraits.hitPointDie.replace(/\D/g, '') ?? '8', 10),
            subclass: subSlot?.selectedName ?? undefined
          }
        })
      }
      return classData
        ? [
            {
              name: classData.name,
              level: targetLevel,
              hitDie: parseInt(classData.coreTraits.hitPointDie.replace(/\D/g, ''), 10) || 8,
              subclass: subclassSlot?.selectedName ?? undefined
            }
          ]
        : []
    })(),
    level: targetLevel,
    background: bgData?.name ?? 'Unknown',
    alignment: characterAlignment || existingChar5e?.alignment || '',
    xp: existingChar5e?.xp ?? 0,
    levelingMode: existingChar5e?.levelingMode ?? 'milestone',
    abilityScores: stats.abilityScores,
    hitPoints: {
      current: Math.min(currentHP ?? existingChar5e?.hitPoints?.current ?? stats.maxHP, stats.maxHP),
      maximum: stats.maxHP,
      temporary: tempHP || existingChar5e?.hitPoints?.temporary || 0
    },
    hitDice: existingChar5e?.hitDice ?? [
      {
        current: targetLevel,
        maximum: targetLevel,
        dieType: parseInt(classData?.coreTraits.hitPointDie.replace(/\D/g, '') ?? '8', 10)
      }
    ],
    armorClass: calculateArmorClass5e({
      dexMod: stats.abilityModifiers.dexterity,
      armor: [...armorBuildResult.armor, ...wearableArmor],
      classNames: classData ? [classData.name] : [],
      conMod: stats.abilityModifiers.constitution,
      wisMod: stats.abilityModifiers.wisdom,
      draconicSorcererLevel: draconicSorcererLevelForHP
    }),
    initiative: stats.initiative,
    speed: computedSpeed,
    speeds: computedSpeeds,
    size: speciesSize || existingChar5e?.size || 'Medium',
    creatureType: speciesData?.creatureType || existingChar5e?.creatureType || 'Humanoid',
    senses: computedSenses,
    resistances: computedResistances,
    immunities: existingChar5e?.immunities ?? [],
    vulnerabilities: existingChar5e?.vulnerabilities ?? [],
    details: computedDetails,
    proficiencies: {
      weapons: weaponProfs,
      armor: armorProfs,
      tools: toolProfs,
      languages: langProfs,
      savingThrows: (classData?.coreTraits.savingThrowProficiencies ?? []).map((s) => s.toLowerCase() as AbilityName)
    },
    skills: computedSkills,
    equipment: filteredEquipment,
    treasure: {
      cp: state.currency.cp,
      sp: state.currency.sp,
      ep: existingChar5e?.treasure?.ep ?? 0,
      gp:
        (bgEquipmentChoice === 'gold' ? Math.max(0, state.currency.gp + 50) : state.currency.gp) +
        state.higherLevelGoldBonus +
        classOptionGold,
      pp: state.currency.pp
    },
    features: [
      ...((state.derivedSpeciesTraits.length > 0 ? state.derivedSpeciesTraits : (speciesData?.traits ?? [])).map(
        (t) => ({
          name: t.name,
          source: speciesData?.name ?? 'Species',
          description: t.description
        })
      ) ?? [])
    ],
    buildChoices: {
      speciesId: speciesSlot?.selectedId ?? '',
      subspeciesId: heritageId ?? existingChar5e?.buildChoices?.subspeciesId ?? undefined,
      classId: classSlot?.selectedId ?? '',
      subclassId: subclassSlot?.selectedId ?? undefined,
      backgroundId: bgSlot?.selectedId ?? '',
      selectedSkills,
      abilityScoreMethod,
      abilityScoreAssignments: { ...abilityScores },
      asiChoices: Object.keys(state.asiSelections).length > 0 ? { ...state.asiSelections } : undefined,
      chosenLanguages: state.chosenLanguages.length > 0 ? [...state.chosenLanguages] : undefined,
      backgroundAbilityBonuses:
        Object.keys(backgroundAbilityBonuses).length > 0 ? { ...backgroundAbilityBonuses } : undefined,
      versatileFeatId: versatileFeatId ?? undefined,
      epicBoonId: buildSlots.find((s) => s.category === 'epic-boon' && s.selectedId)?.selectedId ?? undefined,
      generalFeatChoices:
        Object.keys(state.builderFeatSelections).length > 0
          ? Object.fromEntries(Object.entries(state.builderFeatSelections).map(([slotId, feat]) => [slotId, feat.id]))
          : existingChar5e?.buildChoices?.generalFeatChoices,
      fightingStyleId:
        buildSlots.find((s) => s.category === 'fighting-style' && s.selectedId)?.selectedId ??
        existingChar5e?.buildChoices?.fightingStyleId,
      backgroundEquipmentChoice: bgEquipmentChoice !== 'equipment' ? bgEquipmentChoice : undefined,
      classEquipmentChoice: classEquipmentChoice !== 'A' ? classEquipmentChoice : undefined,
      primalOrderChoice: computedPrimalOrder,
      divineOrderChoice: computedDivineOrder,
      elementalFuryChoice: existingChar5e?.buildChoices?.elementalFuryChoice,
      speciesSpellcastingAbility: speciesSpellcastingAbility ?? undefined,
      keenSensesSkill: keenSensesSkill ?? undefined,
      blessedWarriorCantrips: blessedWarriorCantrips.length > 0 ? blessedWarriorCantrips : undefined,
      druidicWarriorCantrips: druidicWarriorCantrips.length > 0 ? druidicWarriorCantrips : undefined,
      expertiseChoices: Object.keys(mergedExpertiseChoices).length > 0 ? mergedExpertiseChoices : undefined,
      multiclassEntries:
        Object.keys(state.classLevelChoices).length > 0
          ? Object.entries(state.classLevelChoices).map(([lvl, cid]) => ({
              classId: cid,
              levelTaken: Number(lvl)
            }))
          : existingChar5e?.buildChoices?.multiclassEntries
    },
    status: existingChar5e?.status ?? 'active',
    campaignHistory: existingChar5e?.campaignHistory ?? [],
    backstory: state.characterBackstory || existingChar5e?.backstory || '',
    notes: state.characterNotes,
    pets: [...pets],
    languageDescriptions: existingChar5e?.languageDescriptions ?? {},
    conditions: [...conditions],
    deathSaves: existingChar5e?.deathSaves ?? { successes: 0, failures: 0 },
    spellcasting: spellcastingInfo,
    heroicInspiration: existingChar5e?.heroicInspiration,
    wildShapeUses: computedWildShapeUses,
    classResources: computedClassResources,
    speciesResources: computedSpeciesResources,
    attunement: existingChar5e?.attunement ?? [],
    magicItems: magicItems.length > 0 ? magicItems : undefined,
    knownSpells,
    preparedSpellIds: existingChar5e?.preparedSpellIds ?? [],
    spellSlotLevels: computedSpellSlotLevels,
    classFeatures: computedClassFeatures,
    weapons: weaponBuildResult.weapons,
    armor: [...armorBuildResult.armor, ...wearableArmor],
    feats: computedFeats,
    iconPreset: iconType === 'preset' ? iconPreset : undefined,
    portraitPath: iconType === 'custom' ? iconCustom : undefined,
    ...existingCharCarryOver,
    createdAt: existingChar5e?.createdAt ?? now,
    updatedAt: now
  }

  return character
}
