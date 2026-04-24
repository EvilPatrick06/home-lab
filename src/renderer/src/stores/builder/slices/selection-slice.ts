import type { StateCreator } from 'zustand'
import { addToast } from '../../../hooks/use-toast'
import { getOptionsForSlot, load5eBackgrounds, load5eClasses, load5eSpecies } from '../../../services/data-provider'
import { filterOptions } from '../../../types/builder'
import type { SelectableOption } from '../../../types/character-common'
import { logger } from '../../../utils/logger'
import type { BuilderState, SelectionSliceState } from '../types'

export const createSelectionSlice: StateCreator<BuilderState, [], [], SelectionSliceState> = (set, get) => ({
  selectionModal: null,

  openSelectionModal: async (slotId) => {
    const { gameSystem, buildSlots } = get()
    if (!gameSystem) {
      logger.warn('[Builder] openSelectionModal: no gameSystem')
      return
    }
    const slot = buildSlots.find((s) => s.id === slotId)
    if (!slot) {
      logger.warn('[Builder] openSelectionModal: slot not found', slotId)
      return
    }

    // Build context for filtering (e.g. selected class for subclass/class-feat filtering)
    const classSlot = buildSlots.find((s) => s.category === 'class')
    const ancestrySlot = buildSlots.find((s) => s.category === 'ancestry')
    const context = {
      slotId,
      // For heritage slots, pass speciesId via selectedClassId (repurposed)
      selectedClassId:
        slot.category === 'heritage' ? (ancestrySlot?.selectedId ?? undefined) : (classSlot?.selectedId ?? undefined)
    }

    let allOptions: SelectableOption[]
    try {
      allOptions = await getOptionsForSlot(gameSystem, slot.category, context)
    } catch (err) {
      logger.error('[Builder] Failed to load options for slot', slotId, err)
      addToast(`Failed to load options for ${slot.label}`, 'warning')
      return
    }
    if (allOptions.length === 0) {
      logger.warn('[Builder] openSelectionModal: no options loaded for', slotId)
      return
    }

    // Filter out already-selected options from other slots of the same category
    const selectedIds = new Set(
      buildSlots
        .filter(
          (s) =>
            s.category === slot.category && s.id !== slotId && s.selectedId !== null && s.selectedId !== 'confirmed'
        )
        .map((s) => s.selectedId!)
    )
    const options = selectedIds.size > 0 ? allOptions.filter((o) => !selectedIds.has(o.id)) : allOptions
    if (options.length === 0) {
      logger.warn('[Builder] openSelectionModal: all options filtered out for', slotId)
      return
    }

    set({
      selectionModal: {
        slotId,
        title: `Select ${slot.label}`,
        options,
        filteredOptions: options,
        rarityFilter: 'all',
        searchQuery: '',
        previewOptionId: options.length > 0 ? options[0].id : null,
        selectedOptionId: slot.selectedId
      }
    })
  },

  closeSelectionModal: () => set({ selectionModal: null }),

  setModalRarityFilter: (filter) => {
    const modal = get().selectionModal
    if (!modal) return
    const filtered = filterOptions(modal.options, filter, modal.searchQuery)
    set({
      selectionModal: {
        ...modal,
        rarityFilter: filter,
        filteredOptions: filtered
      }
    })
  },

  setModalSearchQuery: (query) => {
    const modal = get().selectionModal
    if (!modal) return
    const filtered = filterOptions(modal.options, modal.rarityFilter, query)
    set({
      selectionModal: {
        ...modal,
        searchQuery: query,
        filteredOptions: filtered
      }
    })
  },

  setModalPreviewOption: (optionId) => {
    const modal = get().selectionModal
    if (!modal) return
    set({ selectionModal: { ...modal, previewOptionId: optionId } })
  },

  acceptSelection: (optionId) => {
    const { selectionModal, buildSlots, gameSystem } = get()
    if (!selectionModal) return
    const option = selectionModal.options.find((o) => o.id === optionId)
    if (!option) return

    const updatedSlots = buildSlots.map((slot) =>
      slot.id === selectionModal.slotId
        ? {
            ...slot,
            selectedId: optionId,
            selectedName: option.name,
            selectedDescription: option.description,
            selectedDetailFields: option.detailFields
          }
        : slot
    )

    const currentSlot = buildSlots.find((s) => s.id === selectionModal.slotId)
    let maxSkills = get().maxSkills
    if (currentSlot?.category === 'class') {
      const skillField = option.detailFields.find((f) => f.label === 'Skills')
      if (skillField) {
        const match = skillField.value.match(/Choose (\d+)/)
        if (match) maxSkills = parseInt(match[1], 10)
      }
      // Account for custom background bonus skills (+2) if background already selected
      const bgSlot = updatedSlots.find((s) => s.category === 'background')
      if (bgSlot?.selectedId === 'custom') {
        maxSkills += 2
      }
      // Account for species extra skill (Human Skillful trait)
      maxSkills += get().speciesExtraSkillCount
    }

    // Set starting gold synchronously from detail fields
    if (currentSlot?.category === 'background') {
      const goldField = option.detailFields.find((f) => f.label === 'Starting Gold')
      if (goldField) {
        const goldVal = parseInt(goldField.value, 10)
        if (!Number.isNaN(goldVal) && goldVal > 0) {
          set({
            buildSlots: updatedSlots,
            selectionModal: null,
            maxSkills,
            currency: { pp: 0, gp: goldVal, sp: 0, cp: 0 }
          })
        } else {
          set({ buildSlots: updatedSlots, selectionModal: null, maxSkills })
        }
      } else {
        set({ buildSlots: updatedSlots, selectionModal: null, maxSkills })
      }
    } else {
      set({ buildSlots: updatedSlots, selectionModal: null, maxSkills })
    }

    // Derive data from SRD after selection (async, cached data is instant)
    if (gameSystem === 'dnd5e') {
      if (currentSlot?.category === 'ancestry') {
        load5eSpecies().then((speciesList) => {
          const speciesData = speciesList.find((r) => r.id === optionId)
          if (speciesData) {
            const extraLangCount = speciesData.traits.filter((t) => t.name === 'Extra Language').length
            const extraSkillCount = speciesData.traits.filter((t) => t.name === 'Skillful').length
            // Recalculate maxSkills including species extra skills
            let baseMaxSkills = get().maxSkills - get().speciesExtraSkillCount // remove old species bonus
            if (baseMaxSkills < 0) baseMaxSkills = get().maxSkills

            // Heritage slot management: remove old, add new if species has subraces
            let currentBuildSlots = get().buildSlots.filter((s) => s.id !== 'heritage')
            const hasSubraces = speciesData.traits.some((t) => t.lineageChoices)
            if (hasSubraces) {
              const ancestryIdx = currentBuildSlots.findIndex((s) => s.category === 'ancestry')
              const heritageSlot = {
                id: 'heritage',
                label: `${speciesData.name} Lineage`,
                category: 'heritage' as const,
                level: 0,
                required: true,
                selectedId: null,
                selectedName: null,
                selectedDescription: null,
                selectedDetailFields: []
              }
              currentBuildSlots = [
                ...currentBuildSlots.slice(0, ancestryIdx + 1),
                heritageSlot,
                ...currentBuildSlots.slice(ancestryIdx + 1)
              ]
            }

            set({
              buildSlots: currentBuildSlots,
              speciesLanguages: [],
              speciesExtraLangCount: extraLangCount,
              speciesExtraSkillCount: extraSkillCount,
              speciesSize: speciesData.size.type === 'fixed' ? (speciesData.size.value ?? '') : '',
              speciesSpeed: speciesData.speed,
              speciesTraits: speciesData.traits,
              derivedSpeciesTraits: speciesData.traits,
              speciesProficiencies: [],
              chosenLanguages: [], // reset when species changes
              versatileFeatId: null, // reset Versatile feat when species changes
              heritageId: null, // reset heritage when species changes
              speciesSpellcastingAbility: null, // reset species spellcasting ability
              keenSensesSkill: null, // reset Elf Keen Senses skill
              maxSkills: baseMaxSkills + extraSkillCount
            })

            // Always advance after species data loads (heritage slot may have been injected)
            queueMicrotask(() => get().advanceToNextSlot())
          }
        })
      }
      if (currentSlot?.category === 'heritage') {
        // Heritage selection: apply lineage choice from species trait
        load5eSpecies().then((speciesList) => {
          const ancestrySlot = get().buildSlots.find((s) => s.category === 'ancestry')
          const speciesData = speciesList.find((r) => r.id === ancestrySlot?.selectedId)
          if (!speciesData) return
          const lineageTrait = speciesData.traits.find((t) => t.lineageChoices)
          if (!lineageTrait?.lineageChoices) return
          const lineageOption = lineageTrait.lineageChoices.options.find(
            (o) => o.name.toLowerCase().replace(/\s+/g, '-') === optionId
          )
          if (!lineageOption) return

          set({
            heritageId: optionId,
            speciesSpeed: lineageOption.speedOverride ?? speciesData.speed,
            chosenLanguages: [], // reset languages when heritage changes
            speciesSpellcastingAbility: null // reset species spellcasting ability when heritage changes
          })
        })
      }
      if (currentSlot?.category === 'background') {
        load5eBackgrounds().then((bgs) => {
          const bg = bgs.find((b) => b.id === optionId)
          if (bg) {
            // Re-derive base maxSkills from the class slot's detail fields
            const currentSlots = get().buildSlots
            const classSlot = currentSlots.find((s) => s.category === 'class')
            let baseMaxSkills = 2
            if (classSlot?.selectedDetailFields) {
              const skillField = classSlot.selectedDetailFields.find((f) => f.label === 'Skills')
              if (skillField) {
                const match = skillField.value.match(/Choose (\d+)/)
                if (match) baseMaxSkills = parseInt(match[1], 10)
              }
            }
            // Custom background: user picks 2 extra skills (since no auto-granted bg skills)
            // Also add species extra skill count (Human Skillful trait)
            const effectiveMaxSkills =
              (optionId === 'custom' ? baseMaxSkills + 2 : baseMaxSkills) + get().speciesExtraSkillCount

            set({
              bgLanguageCount: 0,
              bgEquipment: bg.equipment.map((e) => ({ option: e.option, items: e.items, source: bg.name })),
              chosenLanguages: [], // reset when background changes
              currency: { pp: 0, gp: 0, sp: 0, cp: 0 },
              maxSkills: effectiveMaxSkills,
              selectedSkills: [], // reset skill picks when background changes
              backgroundEquipmentChoice: null // reset when background changes — user must choose
            })
          }
        })
      }
      if (currentSlot?.category === 'class') {
        load5eClasses().then((classes) => {
          const cls = classes.find((c) => c.id === optionId)
          if (cls) {
            // Use starting equipment from coreTraits
            const equipment = cls.coreTraits.startingEquipment
            // Don't pre-populate with labels — wait for user choice or auto-select single option
            const autoItems =
              equipment.length === 1
                ? equipment[0].items.map((name: string) => ({ name, quantity: 1, source: cls.name }))
                : []
            set({
              classEquipment: autoItems,
              classSkillOptions: cls.coreTraits.skillProficiencies.from,
              classEquipmentChoice: equipment.length === 1 ? equipment[0].label : null, // reset when class changes — user must choose
              classExtraLangCount: optionId === 'rogue' ? 1 : optionId === 'ranger' ? 2 : 0,
              chosenLanguages: [] // reset when class changes (language grants may differ)
            })
          }
        })
      }
    }

    // Skip advance for 5e ancestry — handled in the .then() callback after species data loads
    const skipGenericAdvance = gameSystem === 'dnd5e' && currentSlot?.category === 'ancestry'
    if (!skipGenericAdvance) {
      queueMicrotask(() => get().advanceToNextSlot())
    }
  }
})
