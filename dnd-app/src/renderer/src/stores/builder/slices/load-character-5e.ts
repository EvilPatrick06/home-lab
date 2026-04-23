import { addToast } from '../../../hooks/use-toast'
import { generate5eBuildSlots } from '../../../services/character/build-tree-5e'
import { load5eBackgrounds, load5eClasses, load5eSpecies } from '../../../services/data-provider'
import type { Character5e } from '../../../types/character-5e'
import type { AbilityName } from '../../../types/character-common'
import { logger } from '../../../utils/logger'
import type { AbilityScoreMethod, BuilderState } from '../types'

type SetState = (partial: Partial<BuilderState>) => void
type GetState = () => BuilderState

export function loadCharacterForEdit5e(character: Character5e, set: SetState, get: GetState): void {
  const slots = generate5eBuildSlots(character.level, character.buildChoices.classId)
  const speciesSlot = slots.find((s) => s.category === 'ancestry')
  if (speciesSlot && character.buildChoices.speciesId) {
    speciesSlot.selectedId = character.buildChoices.speciesId
    speciesSlot.selectedName = character.species
  }
  const classSlot = slots.find((s) => s.category === 'class')
  if (classSlot && character.buildChoices.classId) {
    classSlot.selectedId = character.buildChoices.classId
    classSlot.selectedName = character.classes[0]?.name ?? null
  }
  const bgSlot = slots.find((s) => s.category === 'background')
  if (bgSlot && character.buildChoices.backgroundId) {
    bgSlot.selectedId = character.buildChoices.backgroundId
    bgSlot.selectedName = character.background
  }
  const abilitySlot = slots.find((s) => s.id === 'ability-scores')
  if (abilitySlot) {
    abilitySlot.selectedId = 'confirmed'
    abilitySlot.selectedName = Object.values(character.abilityScores).join('/')
  }
  const skillSlot = slots.find((s) => s.id === 'skill-choices')
  if (skillSlot) {
    skillSlot.selectedId = 'confirmed'
    skillSlot.selectedName = `${character.buildChoices.selectedSkills.length} selected`
  }

  // Restore heritage (subspecies) selection -- slots are injected after SRD data loads below

  // Restore subclass selection
  if (character.buildChoices.subclassId) {
    const subclassSlot = slots.find((s) => s.id.includes('subclass'))
    if (subclassSlot) {
      subclassSlot.selectedId = character.buildChoices.subclassId
      subclassSlot.selectedName = character.classes[0]?.subclass ?? null
    }
  }

  // Restore Epic Boon selection
  const epicBoonSlot = slots.find((s) => s.category === 'epic-boon')
  if (epicBoonSlot && character.feats) {
    const epicBoon = character.feats.find(
      (f) => f.id.startsWith('epic-boon-') || character.buildChoices.epicBoonId === f.id
    )
    if (epicBoon) {
      epicBoonSlot.selectedId = epicBoon.id
      epicBoonSlot.selectedName = epicBoon.name
    }
  }

  // Restore Primal Order selection
  const primalOrderSlot = slots.find((s) => s.category === 'primal-order')
  if (primalOrderSlot && character.buildChoices.primalOrderChoice) {
    primalOrderSlot.selectedId = character.buildChoices.primalOrderChoice
    primalOrderSlot.selectedName = character.buildChoices.primalOrderChoice === 'magician' ? 'Magician' : 'Warden'
  }

  // Restore Divine Order selection
  const divineOrderSlot = slots.find((s) => s.category === 'divine-order')
  if (divineOrderSlot && character.buildChoices.divineOrderChoice) {
    divineOrderSlot.selectedId = character.buildChoices.divineOrderChoice
    divineOrderSlot.selectedName =
      character.buildChoices.divineOrderChoice === 'protector' ? 'Protector' : 'Thaumaturge'
  }

  // Restore Fighting Style selection
  const fightingStyleSlot = slots.find((s) => s.category === 'fighting-style')
  if (fightingStyleSlot && character.buildChoices.fightingStyleId && character.feats) {
    const fsMatch = character.feats.find((f) => f.id === character.buildChoices.fightingStyleId)
    if (fsMatch) {
      fightingStyleSlot.selectedId = fsMatch.id
      fightingStyleSlot.selectedName = fsMatch.name
    }
  }

  // Restore ASI selections
  const restoredAsiSelections: Record<string, AbilityName[]> = {}
  if (character.buildChoices.asiChoices) {
    for (const [slotId, abilities] of Object.entries(character.buildChoices.asiChoices)) {
      const asiSlot = slots.find((s) => s.id === slotId)
      if (asiSlot) {
        asiSlot.selectedId = 'confirmed'
        asiSlot.selectedName = abilities.join(', ')
      }
      restoredAsiSelections[slotId] = abilities as AbilityName[]
    }
  }

  // Restore expertise selections
  if (character.buildChoices.expertiseChoices) {
    for (const [slotId] of Object.entries(character.buildChoices.expertiseChoices)) {
      const expertiseSlot = slots.find((s) => s.id === slotId)
      if (expertiseSlot) {
        expertiseSlot.selectedId = 'confirmed'
        expertiseSlot.selectedName = character.buildChoices.expertiseChoices[slotId].join(', ')
      }
    }
  }

  // Restore selected spell IDs from knownSpells (excluding species spells which have 'species-' prefix)
  const restoredSpellIds = (character.knownSpells ?? []).filter((s) => !s.id.startsWith('species-')).map((s) => s.id)

  // Restore expertise selections
  const restoredExpertiseSelections: Record<string, string[]> = character.buildChoices.expertiseChoices ?? {}

  // Restore feat selections from generalFeatChoices (slotId → featId)
  const restoredFeatSelections: Record<string, { id: string; name: string; description: string }> = {}
  if (character.buildChoices.generalFeatChoices) {
    for (const [slotId, featId] of Object.entries(character.buildChoices.generalFeatChoices)) {
      const feat = (character.feats ?? []).find((f) => f.id === featId)
      if (feat) {
        restoredFeatSelections[slotId] = { id: feat.id, name: feat.name, description: feat.description }
        // Also mark the ASI slot as confirmed with feat name
        const asiSlot = slots.find((s) => s.id === slotId)
        if (asiSlot) {
          asiSlot.selectedId = 'confirmed'
          asiSlot.selectedName = `Feat: ${feat.name}`
        }
      }
    }
  }

  // Restore multiclass level choices from multiclassEntries
  const restoredClassLevelChoices: Record<number, string> = {}
  if (character.buildChoices.multiclassEntries) {
    for (const entry of character.buildChoices.multiclassEntries) {
      restoredClassLevelChoices[entry.levelTaken] = entry.classId
    }
  }

  set({
    phase: 'building',
    gameSystem: 'dnd5e',
    buildSlots: slots,
    selectionModal: null,
    activeTab: 'details',
    targetLevel: character.level,
    characterName: character.name,
    abilityScores: character.abilityScores,
    abilityScoreMethod: (character.buildChoices.abilityScoreMethod as AbilityScoreMethod) || 'custom',
    selectedSkills: character.buildChoices.selectedSkills,
    editingCharacterId: character.id,
    asiSelections: restoredAsiSelections,
    builderExpertiseSelections: restoredExpertiseSelections,
    builderFeatSelections: restoredFeatSelections,
    classLevelChoices: restoredClassLevelChoices,
    backgroundAbilityBonuses: character.buildChoices.backgroundAbilityBonuses ?? {},
    backgroundEquipmentChoice: character.buildChoices.backgroundEquipmentChoice ?? 'equipment',
    classEquipmentChoice: character.buildChoices.classEquipmentChoice ?? 'A',
    chosenLanguages: (character.buildChoices.chosenLanguages ?? []).filter(
      (l) => l !== 'Druidic' && l !== "Thieves' Cant"
    ),
    selectedSpellIds: restoredSpellIds,
    iconType: character.iconPreset ? 'preset' : character.portraitPath ? 'custom' : 'letter',
    iconPreset: character.iconPreset ?? '',
    iconCustom: character.portraitPath ?? '',
    speciesLanguages: character.proficiencies.languages ?? [],
    currency: {
      pp: character.treasure.pp,
      gp: character.treasure.gp,
      sp: character.treasure.sp,
      cp: character.treasure.cp
    },
    classEquipment: character.equipment.map((e) => ({ ...e, source: e.source || 'existing' })),
    speciesSpeed: character.speed,
    characterGender: character.details?.gender ?? '',
    characterDeity: character.details?.deity ?? '',
    characterAge: character.details?.age ?? '',
    characterHeight: character.details?.height ?? '',
    characterWeight: character.details?.weight ?? '',
    characterEyes: character.details?.eyes ?? '',
    characterHair: character.details?.hair ?? '',
    characterSkin: character.details?.skin ?? '',
    characterAppearance: character.details?.appearance ?? '',
    characterPersonality: character.details?.personality ?? '',
    characterIdeals: character.details?.ideals ?? '',
    characterBonds: character.details?.bonds ?? '',
    characterFlaws: character.details?.flaws ?? '',
    characterBackstory: character.backstory ?? '',
    characterNotes: character.notes ?? '',
    characterAlignment: character.alignment ?? '',
    versatileFeatId: character.buildChoices.versatileFeatId ?? null,
    speciesSpellcastingAbility: character.buildChoices.speciesSpellcastingAbility ?? null,
    keenSensesSkill: character.buildChoices.keenSensesSkill ?? null,
    classExtraLangCount:
      character.classes[0]?.name.toLowerCase() === 'rogue'
        ? 1
        : character.classes[0]?.name.toLowerCase() === 'ranger'
          ? 2
          : 0,
    blessedWarriorCantrips: character.buildChoices.blessedWarriorCantrips ?? [],
    druidicWarriorCantrips: character.buildChoices.druidicWarriorCantrips ?? [],
    pets: character.pets ?? [],
    conditions: character.conditions ?? [],
    currentHP: character.hitPoints.current < character.hitPoints.maximum ? character.hitPoints.current : null,
    tempHP: character.hitPoints.temporary ?? 0
  })

  // Re-derive data from SRD
  Promise.all([load5eSpecies(), load5eClasses(), load5eBackgrounds()])
    .catch((err) => {
      logger.error('Failed to load SRD data for character edit:', err)
      addToast('Some character data failed to load — the builder may be incomplete.', 'warning')
      return [[], [], []] as [
        Awaited<ReturnType<typeof load5eSpecies>>,
        Awaited<ReturnType<typeof load5eClasses>>,
        Awaited<ReturnType<typeof load5eBackgrounds>>
      ]
    })
    .then(([speciesList, classes, bgs]) => {
      const speciesData = speciesList.find((r) => r.id === character.buildChoices.speciesId)
      const cls = classes.find((c) => c.id === character.buildChoices.classId)
      const bg = bgs.find((b) => b.id === character.buildChoices.backgroundId)
      const updates: Partial<BuilderState> = {}
      if (speciesData) {
        updates.speciesLanguages = []
        updates.speciesExtraLangCount = speciesData.traits.filter((t) => t.name === 'Extra Language').length
        updates.speciesExtraSkillCount = speciesData.traits.filter((t) => t.name === 'Skillful').length
        updates.speciesSize =
          speciesData.size.type === 'choice' ? (character.size ?? '') : (speciesData.size.value ?? '')
        updates.speciesSpeed = speciesData.speed
        updates.speciesTraits = speciesData.traits
        updates.speciesProficiencies = []

        // Restore heritage slot if species has lineage choices on a trait
        const lineageTrait = speciesData.traits.find((t) => t.lineageChoices)
        if (lineageTrait?.lineageChoices) {
          let currentSlots = get().buildSlots.filter((s) => s.id !== 'heritage')
          const ancestryIdx = currentSlots.findIndex((s) => s.category === 'ancestry')
          const heritageSlot = {
            id: 'heritage',
            label: lineageTrait.lineageChoices.label || `${speciesData.name} Lineage`,
            category: 'heritage' as const,
            level: 0,
            required: true,
            selectedId: character.buildChoices.subspeciesId ?? null,
            selectedName: character.subspecies ?? null,
            selectedDescription: null,
            selectedDetailFields: [] as Array<{ label: string; value: string }>
          }
          currentSlots = [
            ...currentSlots.slice(0, ancestryIdx + 1),
            heritageSlot,
            ...currentSlots.slice(ancestryIdx + 1)
          ]
          updates.buildSlots = currentSlots
          updates.heritageId = character.buildChoices.subspeciesId ?? null

          // Apply lineage speed override if a lineage option is selected
          if (character.buildChoices.subspeciesId) {
            const selectedLineage = lineageTrait.lineageChoices.options.find(
              (opt) => opt.name === character.buildChoices.subspeciesId || opt.name === character.subspecies
            )
            if (selectedLineage?.speedOverride) {
              updates.speciesSpeed = selectedLineage.speedOverride
            }
          }
        }
        updates.derivedSpeciesTraits = speciesData.traits
      }
      if (cls) {
        const current = get().classEquipment
        const shopItems = current.filter((e: { source?: string }) => e.source === 'shop' || e.source === 'existing')
        const savedChoice = character.buildChoices.classEquipmentChoice || 'A'
        const chosenEntry =
          cls.coreTraits.startingEquipment.find((e: { label: string }) => e.label === savedChoice) ??
          cls.coreTraits.startingEquipment[0]
        const classItems = chosenEntry
          ? chosenEntry.items.map((name: string) => ({ name, quantity: 1, source: cls.name }))
          : []
        updates.classEquipment = [...classItems, ...shopItems]
        // Re-derive maxSkills from class + custom background bonus + species extra skill
        const speciesExtraSkills =
          speciesData?.traits.filter((t: { name: string }) => t.name === 'Skillful').length ?? 0
        updates.maxSkills =
          cls.coreTraits.skillProficiencies.count +
          (character.buildChoices.backgroundId === 'custom' ? 2 : 0) +
          speciesExtraSkills
      }
      if (bg) {
        updates.bgLanguageCount = 0
        updates.bgEquipment = bg.equipment.map((e) => ({ option: e.option, items: e.items, source: bg.name }))
      }
      set(updates)
    })
}
