import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { VARIANT_ITEMS } from '../../../data/variant-items'
import { clearBuilderDraft } from '../../../hooks/use-auto-save'
import { addToast } from '../../../hooks/use-toast'
import { useT } from '../../../i18n'
import { getCantripsKnown, getPreparedSpellMax, hasAnySpellcasting } from '../../../services/character/spell-data'
import { getHeritageOptions5e, load5eSpells, resolveDataPath } from '../../../services/data-provider'
import { useLibraryCategory } from '../../../services/library/use-library-entry'
import { useNetworkStore } from '../../../stores/network-store'
import { useBuilderStore } from '../../../stores/use-builder-store'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { PRIMORDIAL_DIALECTS } from '../../../types/character-common'
import { logger } from '../../../utils/logger'
import Modal from '../../ui/Modal'
import BuildSidebar from '../shared/BuildSidebar'
import CharacterSummaryBar5e from './CharacterSummaryBar5e'
import MainContentArea5e from './MainContentArea5e'

const SPECIES_WITH_SPELL_ABILITY = ['elf', 'tiefling', 'gnome']

// Phase 17p — character builder data sourcing.
//
// All entity data (species, classes, subclasses, backgrounds, feats,
// spells, magic items, etc.) is sourced from the same `load5e*` helpers
// in `services/data-provider.ts` that the LibraryPage uses, so the
// builder and library share a single source of truth — there is no
// separate "builder subset" data file.
//
// What the user perceives as "missing fields" is per-tab UI rendering
// that picks specific fields relevant to a given build step. To see
// every field on an entry, use the floating "Library" button (Phase
// 17m) in the top-right of the builder — it routes to the LibraryPage
// with `?from=` so the back button comes here. A future phase can wire
// per-entry deep-linking (e.g. `/library?from=...&entry=elf`) but
// for now the builder's per-step panels stay scoped to the relevant
// fields by design.

export default function CharacterBuilder5e(): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string })?.returnTo
  const resetBuilder = useBuilderStore((s) => s.resetBuilder)
  const buildCharacter5e = useBuilderStore((s) => s.buildCharacter5e)
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const editingCharacterId = useBuilderStore((s) => s.editingCharacterId)
  const characterName = useBuilderStore((s) => s.characterName)
  const backgroundAbilityBonuses = useBuilderStore((s) => s.backgroundAbilityBonuses)
  const chosenLanguages = useBuilderStore((s) => s.chosenLanguages)
  const speciesExtraLangCount = useBuilderStore((s) => s.speciesExtraLangCount)
  const bgLanguageCount = useBuilderStore((s) => s.bgLanguageCount)
  const selectedSkills = useBuilderStore((s) => s.selectedSkills)
  const maxSkills = useBuilderStore((s) => s.maxSkills)
  const versatileFeatId = useBuilderStore((s) => s.versatileFeatId)
  const characterGender = useBuilderStore((s) => s.characterGender)
  const characterAge = useBuilderStore((s) => s.characterAge)
  const characterHeight = useBuilderStore((s) => s.characterHeight)
  const characterWeight = useBuilderStore((s) => s.characterWeight)
  const characterEyes = useBuilderStore((s) => s.characterEyes)
  const characterHair = useBuilderStore((s) => s.characterHair)
  const characterSkin = useBuilderStore((s) => s.characterSkin)
  const characterPersonality = useBuilderStore((s) => s.characterPersonality)
  const characterIdeals = useBuilderStore((s) => s.characterIdeals)
  const characterBonds = useBuilderStore((s) => s.characterBonds)
  const characterFlaws = useBuilderStore((s) => s.characterFlaws)
  const characterBackstory = useBuilderStore((s) => s.characterBackstory)
  const speciesSize = useBuilderStore((s) => s.speciesSize)
  const heritageId = useBuilderStore((s) => s.heritageId)
  const speciesSpellcastingAbility = useBuilderStore((s) => s.speciesSpellcastingAbility)
  const keenSensesSkill = useBuilderStore((s) => s.keenSensesSkill)
  const selectedSpellIds = useBuilderStore((s) => s.selectedSpellIds)
  const targetLevel = useBuilderStore((s) => s.targetLevel)
  const backgroundEquipmentChoice = useBuilderStore((s) => s.backgroundEquipmentChoice)
  const classEquipmentChoice = useBuilderStore((s) => s.classEquipmentChoice)
  const characterAlignment = useBuilderStore((s) => s.characterAlignment)
  const characterDeity = useBuilderStore((s) => s.characterDeity)
  const characterAppearance = useBuilderStore((s) => s.characterAppearance)
  const characterNotes = useBuilderStore((s) => s.characterNotes)
  const classEquipment = useBuilderStore((s) => s.classEquipment)
  const bgEquipment = useBuilderStore((s) => s.bgEquipment)
  const blessedWarriorCantrips = useBuilderStore((s) => s.blessedWarriorCantrips)
  const druidicWarriorCantrips = useBuilderStore((s) => s.druidicWarriorCantrips)
  const classExtraLangCount = useBuilderStore((s) => s.classExtraLangCount)
  const guidedMode = useBuilderStore((s) => s.guidedMode)
  const setGuidedMode = useBuilderStore((s) => s.setGuidedMode)
  const saveCharacter = useCharacterStore((s) => s.saveCharacter)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)

  // Phase 15b Step 1 — spell level map derives from the live truth-store spells.
  const setSpellLevelMapStore = useBuilderStore((s) => s.setSpellLevelMap)
  const spellEntries = useLibraryCategory('spells', load5eSpells) as unknown as Array<{ id: string; level: number }>
  const spellLevelMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of spellEntries) map.set(s.id, s.level)
    return map
  }, [spellEntries])
  const spellDataError = false
  useEffect(() => {
    const record: Record<string, number> = {}
    for (const s of spellEntries) record[s.id] = s.level
    setSpellLevelMapStore(record)
  }, [spellEntries, setSpellLevelMapStore])

  // Preload heritage options for the selected species
  const speciesSlot = useBuilderStore((s) => s.buildSlots.find((sl) => sl.id === 'ancestry'))
  useEffect(() => {
    const speciesId = speciesSlot?.selectedId
    if (speciesId) {
      const dataPath = resolveDataPath('dnd5e', 'species')
      logger.debug('Resolved species data path:', dataPath)
      getHeritageOptions5e(speciesId).catch((e) =>
        logger.warn('Failed to load heritage options for species', speciesId, e)
      )
    }
  }, [speciesSlot?.selectedId])

  // Validation
  const validation = useMemo(() => {
    const issues: string[] = []

    // 1. Name required
    if (!characterName.trim()) {
      issues.push(t('builder.characterBuilder.validation.nameRequired'))
    }

    // 2. Foundation slots filled
    const foundationCategories = ['ancestry', 'class', 'background']
    const foundationSlots = buildSlots.filter(
      (s) => foundationCategories.includes(s.category) || s.id === 'ability-scores' || s.id === 'skill-choices'
    )
    const unfilledFoundation = foundationSlots.filter((s) => !s.selectedId)
    if (unfilledFoundation.length > 0) {
      issues.push(t('builder.characterBuilder.validation.foundationIncomplete'))
    }

    // 3. Alignment required
    if (!characterAlignment) {
      issues.push(t('builder.characterBuilder.validation.alignmentRequired'))
    }

    // 4. Background equipment choice required (if background selected and not custom)
    const backgroundId = buildSlots.find((s) => s.category === 'background')?.selectedId
    if (backgroundId && backgroundId !== 'custom' && backgroundEquipmentChoice === null) {
      issues.push(t('builder.characterBuilder.validation.backgroundEquipment'))
    }

    // 5. Class equipment choice required (if class selected)
    const classSlot = buildSlots.find((s) => s.category === 'class')
    if (classSlot?.selectedId && classEquipmentChoice === null) {
      issues.push(t('builder.characterBuilder.validation.classEquipment'))
    }

    // 6. Equipment variant choices required
    const bgItems = (bgEquipment ?? []).flatMap((e) => e.items.map((item) => ({ name: item, source: e.source })))
    const allEquip = [...classEquipment, ...bgItems]
    const equipmentVariantsMsg = t('builder.characterBuilder.validation.equipmentVariants')
    for (const item of allEquip) {
      const name = item.name.toLowerCase()
      for (const [key, config] of Object.entries(VARIANT_ITEMS)) {
        if (name.includes(key) && !config.variants.some((v) => v.toLowerCase() === name)) {
          issues.push(equipmentVariantsMsg)
          break
        }
      }
      if (issues[issues.length - 1] === equipmentVariantsMsg) break
    }

    // 7. Trinket required (only for new characters; existing characters may pre-date the trinket system)
    if (!editingCharacterId && !classEquipment.some((e) => e.source === 'trinket')) {
      issues.push(t('builder.characterBuilder.validation.trinket'))
    }

    // 8. Background ability bonuses complete (2024 5e: ASI from background)
    const backgroundSlot = buildSlots.find((s) => s.category === 'background')
    if (backgroundSlot?.selectedId) {
      const totalBonusPoints = Object.values(backgroundAbilityBonuses).reduce((a, b) => a + b, 0)
      if (totalBonusPoints !== 3) {
        issues.push(t('builder.characterBuilder.validation.backgroundBonuses'))
      }
    }

    // 9. Skill proficiencies complete
    const skillSlot = buildSlots.find((s) => s.id === 'skill-choices')
    if (skillSlot?.selectedId && maxSkills > 0 && selectedSkills.length < maxSkills) {
      issues.push(
        t('builder.characterBuilder.validation.skillProficiencies', {
          maxSkills,
          selected: selectedSkills.length
        })
      )
    }

    // 10. Human Versatile feat required
    const speciesSlot = buildSlots.find((s) => s.category === 'ancestry')
    if (speciesSlot?.selectedId === 'human' && !versatileFeatId) {
      issues.push(t('builder.characterBuilder.validation.versatileFeat'))
    }

    // 11. Species size choice required (Human, Tiefling can be Small or Medium)
    if (speciesSlot?.selectedId && speciesSize === '') {
      issues.push(t('builder.characterBuilder.validation.size'))
    }

    // 12. Heritage required if species has subraces
    const heritageSlot = buildSlots.find((s) => s.id === 'heritage')
    if (heritageSlot && !heritageSlot.selectedId) {
      issues.push(t('builder.characterBuilder.validation.heritage'))
    }

    // 13. Species spellcasting ability required (Elf, Tiefling, Gnome after heritage)
    if (
      speciesSlot?.selectedId &&
      SPECIES_WITH_SPELL_ABILITY.includes(speciesSlot.selectedId) &&
      heritageId &&
      !speciesSpellcastingAbility
    ) {
      issues.push(t('builder.characterBuilder.validation.spellcastingAbility'))
    }

    // 14. Keen Senses skill required (Elf)
    if (speciesSlot?.selectedId === 'elf' && !keenSensesSkill) {
      issues.push(t('builder.characterBuilder.validation.keenSenses'))
    }

    // 15. Languages complete
    const totalBonusSlots = 2 + speciesExtraLangCount + bgLanguageCount + classExtraLangCount
    if (totalBonusSlots > 0 && chosenLanguages.length < totalBonusSlots) {
      issues.push(
        t('builder.characterBuilder.validation.moreLanguages', {
          count: totalBonusSlots - chosenLanguages.length
        })
      )
    }
    // Warn if Primordial is chosen without specifying a dialect
    if (
      chosenLanguages.includes('Primordial') &&
      !chosenLanguages.some((lang) => PRIMORDIAL_DIALECTS.includes(lang as (typeof PRIMORDIAL_DIALECTS)[number]))
    ) {
      issues.push(
        t('builder.characterBuilder.validation.primordialDialect', { dialects: PRIMORDIAL_DIALECTS.join(', ') })
      )
    }

    // 16. Class spell selection validation
    if (classSlot?.selectedId && hasAnySpellcasting(classSlot.selectedId) && spellLevelMap.size > 0) {
      const cantripsMax = getCantripsKnown(classSlot.selectedId, targetLevel)
      const preparedMax = getPreparedSpellMax(classSlot.selectedId, targetLevel)

      let cantripCount = 0
      let preparedCount = 0
      for (const id of selectedSpellIds) {
        const lvl = spellLevelMap.get(id)
        if (lvl === 0) cantripCount++
        else if (lvl !== undefined && lvl > 0) preparedCount++
      }

      if (cantripsMax > 0 && cantripCount < cantripsMax) {
        issues.push(t('builder.characterBuilder.validation.cantrips', { cantripsMax, cantripCount }))
      }
      if (preparedMax !== null && preparedMax > 0 && preparedCount < preparedMax) {
        issues.push(t('builder.characterBuilder.validation.preparedSpells', { preparedMax, preparedCount }))
      }
    }

    // 17. Fighting style cantrip validation
    const fightingStyleSlot = buildSlots.find((s) => s.category === 'fighting-style')
    if (fightingStyleSlot?.selectedId === 'fighting-style-blessed-warrior' && blessedWarriorCantrips.length < 2) {
      issues.push(
        t('builder.characterBuilder.validation.blessedWarriorCantrips', { count: blessedWarriorCantrips.length })
      )
    }
    if (fightingStyleSlot?.selectedId === 'druidic-warrior' && druidicWarriorCantrips.length < 2) {
      issues.push(
        t('builder.characterBuilder.validation.druidicWarriorCantrips', { count: druidicWarriorCantrips.length })
      )
    }

    return issues
  }, [
    characterName,
    buildSlots,
    backgroundAbilityBonuses,
    backgroundEquipmentChoice,
    classEquipmentChoice,
    chosenLanguages,
    speciesExtraLangCount,
    bgLanguageCount,
    classExtraLangCount,
    selectedSkills,
    maxSkills,
    versatileFeatId,
    speciesSize,
    heritageId,
    speciesSpellcastingAbility,
    keenSensesSkill,
    selectedSpellIds,
    targetLevel,
    spellLevelMap,
    blessedWarriorCantrips,
    druidicWarriorCantrips,
    characterAlignment,
    classEquipment,
    bgEquipment,
    editingCharacterId
  ])

  const canSave = validation.length === 0

  // Check which detail and backstory fields are blank
  const blankDetailFields = useMemo(() => {
    const blank: string[] = []
    if (!characterGender.trim()) blank.push(t('builder.characterBuilder.field.gender'))
    if (!characterDeity.trim()) blank.push(t('builder.characterBuilder.field.deity'))
    if (!characterAge.trim()) blank.push(t('builder.characterBuilder.field.age'))
    if (!characterHeight.trim()) blank.push(t('builder.characterBuilder.field.height'))
    if (!characterWeight.trim()) blank.push(t('builder.characterBuilder.field.weight'))
    if (!characterEyes.trim()) blank.push(t('builder.characterBuilder.field.eyes'))
    if (!characterHair.trim()) blank.push(t('builder.characterBuilder.field.hair'))
    if (!characterSkin.trim()) blank.push(t('builder.characterBuilder.field.skin'))
    if (!characterAppearance.trim()) blank.push(t('builder.characterBuilder.field.appearance'))
    if (!characterPersonality.trim()) blank.push(t('builder.characterBuilder.field.personality'))
    if (!characterIdeals.trim()) blank.push(t('builder.characterBuilder.field.ideals'))
    if (!characterBonds.trim()) blank.push(t('builder.characterBuilder.field.bonds'))
    if (!characterFlaws.trim()) blank.push(t('builder.characterBuilder.field.flaws'))
    if (!characterBackstory.trim()) blank.push(t('builder.characterBuilder.field.backstory'))
    if (!characterNotes.trim()) blank.push(t('builder.characterBuilder.field.notes'))
    return blank
  }, [
    characterGender,
    characterDeity,
    characterAge,
    characterHeight,
    characterWeight,
    characterEyes,
    characterHair,
    characterSkin,
    characterAppearance,
    characterPersonality,
    characterIdeals,
    characterBonds,
    characterFlaws,
    characterBackstory,
    characterNotes
  ])

  const doSave = async (): Promise<void> => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const character = await buildCharacter5e()
      await saveCharacter(character)

      // If DM edited a remote player's character, send the update over the network.
      // Phase 29e — structural transport gate: only the network host can
      // broadcast `dm:character-update`. Phase 30 will revisit role-as-string.
      const { role, sendMessage } = useNetworkStore.getState()
      if (role === 'host' && character.playerId !== 'local') {
        sendMessage('dm:character-update', {
          characterId: character.id,
          characterData: character,
          targetPeerId: character.playerId
        })
        useLobbyStore.getState().setRemoteCharacter(character.id, character)
      }

      clearBuilderDraft()
      resetBuilder()
      navigate(returnTo || `/characters/5e/${character.id}`)
    } catch (err) {
      logger.error('Failed to save character:', err)
      addToast(t('builder.characterBuilder.saveError'), 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (savingRef.current || !canSave) return
    // Check for blank backstory fields
    if (blankDetailFields.length > 0) {
      setShowConfirmDialog(true)
      return
    }
    await doSave()
  }

  const handleBack = (): void => {
    if (editingCharacterId) {
      setShowLeaveDialog(true)
      return
    }
    resetBuilder()
    navigate(returnTo || '/characters')
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-gray-200 text-sm flex items-center gap-1 transition-colors"
          >
            &larr; {t('builder.characterBuilder.back')}
          </button>
          <div className="w-px h-4 bg-gray-700" />
          <span className="text-xs text-gray-500">
            {editingCharacterId ? t('builder.characterBuilder.editCharacter') : t('builder.characterBuilder.title')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={guidedMode}
              onChange={(e) => setGuidedMode(e.target.checked)}
              className="rounded"
            />
            {t('builder.characterBuilder.guided')}
          </label>
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
            >
              {saving
                ? t('builder.characterBuilder.saving')
                : editingCharacterId
                  ? t('builder.characterBuilder.saveChanges')
                  : t('builder.characterBuilder.saveCharacter')}
            </button>
            {!canSave && validation.length > 0 && (
              <span
                role="alert"
                aria-live="polite"
                className="text-xs text-red-400 max-w-60 text-right truncate"
                title={validation.join(', ')}
              >
                {validation[0]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <CharacterSummaryBar5e />

      {/* Spell data load error warning */}
      {spellDataError && (
        <div className="px-3 py-1.5 bg-yellow-900/50 border-b border-yellow-700/50 text-xs text-yellow-400 text-center">
          {t('builder.characterBuilder.spellDataError')}
        </div>
      )}

      {/* Main 2-panel layout */}
      <div className="flex flex-1 min-h-0">
        <BuildSidebar />
        <MainContentArea5e />
      </div>

      {/* Backstory confirmation dialog */}
      <Modal
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        title={t('builder.characterBuilder.incompleteTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">{t('builder.characterBuilder.incompleteBlankFields')}</p>
          <ul className="list-disc list-inside text-sm text-amber-400 space-y-1">
            {blankDetailFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
          <p className="text-sm text-gray-400">{t('builder.characterBuilder.incompleteConfirm')}</p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowConfirmDialog(false)}
              className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
            >
              {t('builder.characterBuilder.goBack')}
            </button>
            <button
              onClick={() => {
                setShowConfirmDialog(false)
                doSave()
              }}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded font-semibold transition-colors"
            >
              {t('builder.characterBuilder.saveAnyway')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Leave without saving confirmation */}
      <Modal
        open={showLeaveDialog}
        onClose={() => setShowLeaveDialog(false)}
        title={t('builder.characterBuilder.leaveTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">{t('builder.characterBuilder.leaveBody')}</p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowLeaveDialog(false)}
              className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
            >
              {t('builder.characterBuilder.stay')}
            </button>
            <button
              onClick={() => {
                setShowLeaveDialog(false)
                resetBuilder()
                navigate(returnTo || '/characters')
              }}
              className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white rounded font-semibold transition-colors"
            >
              {t('builder.characterBuilder.leave')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
