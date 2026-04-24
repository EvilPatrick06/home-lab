import { useEffect, useMemo, useState } from 'react'
import { formatPrerequisites, load5eFeats } from '../../../services/data-provider'
import { useBuilderStore } from '../../../stores/use-builder-store'
import type { Character5e } from '../../../types/character-5e'
import type { AbilityName } from '../../../types/character-common'
import { ABILITY_NAMES, abilityModifier, formatMod } from '../../../types/character-common'
import type { FeatData } from '../../../types/data'
import { meetsFeatPrerequisites } from '../../../utils/feat-prerequisites'

export default function AsiModal(): JSX.Element {
  const abilityScores = useBuilderStore((s) => s.abilityScores)
  const activeAsiSlotId = useBuilderStore((s) => s.activeAsiSlotId)
  const confirmAsi = useBuilderStore((s) => s.confirmAsi)
  const resetAsi = useBuilderStore((s) => s.resetAsi)
  const closeCustomModal = useBuilderStore((s) => s.closeCustomModal)
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const builderFeatSelections = useBuilderStore((s) => s.builderFeatSelections)
  const setBuilderFeatSelection = useBuilderStore((s) => s.setBuilderFeatSelection)
  const selectedSkills = useBuilderStore((s) => s.selectedSkills)
  const targetLevel = useBuilderStore((s) => s.targetLevel)

  const [tab, setTab] = useState<'asi' | 'feat'>('asi')
  const [mode, setMode] = useState<'+2' | '+1/+1'>('+2')
  const [selected, setSelected] = useState<AbilityName[]>([])

  // Feat state
  const [allFeats, setAllFeats] = useState<FeatData[]>([])
  const [featsLoadError, setFeatsLoadError] = useState(false)
  const [featSearch, setFeatSearch] = useState('')
  const [chosenFeat, setChosenFeat] = useState<FeatData | null>(null)

  const asiSlot = buildSlots.find((s) => s.id === activeAsiSlotId)
  const isAlreadyConfirmed = asiSlot?.selectedId === 'confirmed'
  const slotLevel = asiSlot?.level ?? targetLevel

  // Check if this slot already has a feat selection
  const existingFeatSelection = activeAsiSlotId ? builderFeatSelections[activeAsiSlotId] : null

  useEffect(() => {
    if (existingFeatSelection) {
      setTab('feat')
    }
  }, [existingFeatSelection])

  // Load feats when switching to feat tab
  useEffect(() => {
    if (tab === 'feat' && allFeats.length === 0 && !featsLoadError) {
      load5eFeats('General')
        .then(setAllFeats)
        .catch(() => setFeatsLoadError(true))
    }
  }, [tab, allFeats.length, featsLoadError])

  // Build a partial character for prerequisite checking
  const partialCharacter = useMemo((): Character5e => {
    const classSlot = buildSlots.find((s) => s.category === 'class')
    const className = classSlot?.selectedName ?? ''
    const classId = classSlot?.selectedId ?? ''

    // Determine armor proficiencies from class
    const armorProfs: string[] = []
    const heavyArmorClasses = ['fighter', 'paladin']
    const mediumArmorClasses = ['barbarian', 'cleric', 'druid', 'ranger']
    const lightArmorClasses = ['bard', 'rogue', 'warlock']
    if (heavyArmorClasses.includes(classId)) armorProfs.push('Light Armor', 'Medium Armor', 'Heavy Armor', 'Shields')
    else if (mediumArmorClasses.includes(classId)) armorProfs.push('Light Armor', 'Medium Armor', 'Shields')
    else if (lightArmorClasses.includes(classId)) armorProfs.push('Light Armor')

    const spellcastingClasses = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard']

    return {
      level: slotLevel,
      abilityScores,
      classes: [{ name: className, level: slotLevel, hitDie: 8 }],
      proficiencies: {
        weapons: [],
        armor: armorProfs,
        tools: [],
        languages: [],
        savingThrows: []
      },
      skills: selectedSkills.map((s) => ({
        name: s,
        ability: 'strength' as AbilityName,
        proficient: true,
        expertise: false
      })),
      spellcasting: spellcastingClasses.includes(classId)
        ? { ability: 'intelligence' as AbilityName, spellSaveDC: 10, spellAttackBonus: 0 }
        : undefined
    } as unknown as Character5e
  }, [abilityScores, buildSlots, selectedSkills, slotLevel])

  // Filter feats
  const filteredFeats = useMemo(() => {
    // Exclude feats already selected in other ASI slots
    const takenFeatIds = new Set(
      Object.entries(builderFeatSelections)
        .filter(([sid]) => sid !== activeAsiSlotId)
        .map(([, f]) => f.id)
    )
    return allFeats
      .filter((f) => !takenFeatIds.has(f.id) || f.repeatable)
      .filter((f) => !featSearch || f.name.toLowerCase().includes(featSearch.toLowerCase()))
  }, [allFeats, featSearch, builderFeatSelections, activeAsiSlotId])

  const toggleAbility = (ab: AbilityName): void => {
    if (mode === '+2') {
      setSelected([ab])
    } else {
      if (selected.includes(ab)) {
        setSelected(selected.filter((a) => a !== ab))
      } else if (selected.length < 2) {
        setSelected([...selected, ab])
      }
    }
  }

  const canConfirmAsi = mode === '+2' ? selected.length === 1 : selected.length === 2

  const handleConfirmAsi = (): void => {
    if (!activeAsiSlotId || !canConfirmAsi) return
    // Clear any feat selection for this slot
    setBuilderFeatSelection(activeAsiSlotId, null)
    confirmAsi(activeAsiSlotId, selected)
    setSelected([])
  }

  const handleConfirmFeat = (): void => {
    if (!activeAsiSlotId || !chosenFeat) return
    setBuilderFeatSelection(activeAsiSlotId, {
      id: chosenFeat.id,
      name: chosenFeat.name,
      description: chosenFeat.benefits.map((b) => b.description).join(' ')
    })
    // Mark the slot as confirmed with the feat name
    const updatedSlots = buildSlots.map((slot) =>
      slot.id === activeAsiSlotId
        ? { ...slot, selectedId: 'confirmed', selectedName: `Feat: ${chosenFeat.name}` }
        : slot
    )
    useBuilderStore.setState({ buildSlots: updatedSlots, customModal: null, activeAsiSlotId: null })
    queueMicrotask(() => useBuilderStore.getState().advanceToNextSlot())
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-900/98 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h2 className="text-lg font-bold text-gray-100">
          Ability Score Improvement
          {asiSlot && <span className="text-sm font-normal text-gray-500 ml-2">(Level {asiSlot.level})</span>}
        </h2>
        <button onClick={closeCustomModal} className="text-gray-400 hover:text-gray-200 text-xl leading-none px-2">
          &#x2715;
        </button>
      </div>

      {/* Tab toggle */}
      {!isAlreadyConfirmed && (
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setTab('asi')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'asi' ? 'text-amber-300 border-b-2 border-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Ability Score Improvement
          </button>
          <button
            onClick={() => setTab('feat')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'feat' ? 'text-amber-300 border-b-2 border-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Feat
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'asi' ? (
          <>
            <p className="text-sm text-gray-400 mb-4">
              Choose to increase one ability score by 2, or two ability scores by 1 each. Scores cannot exceed 20.
            </p>

            {/* Mode selector */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  setMode('+2')
                  setSelected([])
                }}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  mode === '+2'
                    ? 'bg-amber-900/30 border-amber-500/50 text-amber-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                +2 to One
              </button>
              <button
                onClick={() => {
                  setMode('+1/+1')
                  setSelected([])
                }}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  mode === '+1/+1'
                    ? 'bg-amber-900/30 border-amber-500/50 text-amber-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                +1 to Two
              </button>
            </div>

            {/* Ability grid */}
            <div className="grid grid-cols-3 gap-4 max-w-lg">
              {ABILITY_NAMES.map((ab) => {
                const score = abilityScores[ab]
                const mod = abilityModifier(score)
                const isSelected = selected.includes(ab)
                const boost = isSelected ? (mode === '+2' ? 2 : 1) : 0
                const atMax = score >= 20 || (mode === '+2' && score >= 19 && !isSelected)

                return (
                  <button
                    key={ab}
                    onClick={() => !isAlreadyConfirmed && !atMax && toggleAbility(ab)}
                    disabled={isAlreadyConfirmed || atMax}
                    className={`rounded-lg p-3 text-center border transition-colors ${
                      isSelected
                        ? 'bg-amber-900/30 border-amber-500'
                        : atMax
                          ? 'bg-gray-800/50 border-gray-700/50 opacity-50 cursor-not-allowed'
                          : 'bg-gray-800 border-gray-700 hover:border-gray-500 cursor-pointer'
                    }`}
                  >
                    <div className="text-xs text-gray-400 uppercase font-semibold mb-1">{ab.slice(0, 3)}</div>
                    <div className="text-lg font-bold text-gray-100">
                      {score}
                      {boost > 0 && <span className="text-green-400 text-sm ml-1">+{boost}</span>}
                    </div>
                    <div className="text-amber-400 font-bold text-sm">
                      {formatMod(mod)}
                      {boost > 0 && (
                        <span className="text-green-400 ml-1">({formatMod(abilityModifier(score + boost))})</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-3">
              Choose a General feat instead of an Ability Score Improvement. Feats with unmet prerequisites are
              disabled.
            </p>
            <input
              type="text"
              placeholder="Search feats..."
              value={featSearch}
              onChange={(e) => setFeatSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 mb-3 focus:outline-none focus:border-amber-500"
            />
            <div className="space-y-1">
              {filteredFeats.map((feat) => {
                const meetsPrereqs = meetsFeatPrerequisites(partialCharacter, feat.prerequisites)
                const isSelected = chosenFeat?.id === feat.id || existingFeatSelection?.id === feat.id
                return (
                  <button
                    key={feat.id}
                    onClick={() => meetsPrereqs && setChosenFeat(feat)}
                    disabled={!meetsPrereqs}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      isSelected
                        ? 'bg-amber-900/30 border border-amber-500 text-amber-200'
                        : meetsPrereqs
                          ? 'bg-gray-800 hover:bg-gray-750 text-gray-200 border border-transparent'
                          : 'bg-gray-800/50 text-gray-600 border border-transparent cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{feat.name}</span>
                      {feat.abilityScoreIncrease && (
                        <span className="text-[10px] text-green-500">
                          {feat.abilityScoreIncrease.options
                            .map((o) => `+${o.amount} ${o.abilities.join('/')}`)
                            .join(', ')}
                        </span>
                      )}
                    </div>
                    {!meetsPrereqs && formatPrerequisites(feat.prerequisites).length > 0 && (
                      <div className="text-[10px] text-red-400 mt-0.5">
                        Requires: {formatPrerequisites(feat.prerequisites).join(', ')}
                      </div>
                    )}
                    {meetsPrereqs && (
                      <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                        {feat.benefits.map((b) => b.description).join(' ')}
                      </div>
                    )}
                  </button>
                )
              })}
              {allFeats.length === 0 && !featsLoadError && (
                <p className="text-xs text-gray-500 text-center py-4">Loading feats...</p>
              )}
              {featsLoadError && (
                <p className="text-xs text-red-400 text-center py-4">
                  Failed to load feats. Please close and reopen this panel.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 bg-gray-900">
        <span className="text-xs text-gray-500">
          {tab === 'asi'
            ? mode === '+2'
              ? 'Increase one ability by 2'
              : 'Increase two abilities by 1 each'
            : chosenFeat
              ? `Selected: ${chosenFeat.name}`
              : 'Choose a feat'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={closeCustomModal}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          {isAlreadyConfirmed ? (
            <button
              onClick={() => {
                if (activeAsiSlotId) {
                  setBuilderFeatSelection(activeAsiSlotId, null)
                  resetAsi(activeAsiSlotId)
                }
              }}
              className="px-4 py-2 text-sm font-medium rounded transition-colors bg-red-700 hover:bg-red-600 text-white"
            >
              Reset & Re-choose
            </button>
          ) : tab === 'asi' ? (
            <button
              onClick={handleConfirmAsi}
              disabled={!canConfirmAsi}
              className="px-4 py-2 text-sm font-medium rounded transition-colors bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white"
            >
              Confirm ASI
            </button>
          ) : (
            <button
              onClick={handleConfirmFeat}
              disabled={!chosenFeat}
              className="px-4 py-2 text-sm font-medium rounded transition-colors bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white"
            >
              Confirm Feat
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
