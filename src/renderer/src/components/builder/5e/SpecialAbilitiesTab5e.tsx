import { useEffect, useState } from 'react'
import { load5eBackgrounds, load5eSpecies } from '../../../services/data-provider'
import { useBuilderStore } from '../../../stores/use-builder-store'
import type { AbilityName } from '../../../types/character-common'
import { ABILITY_NAMES } from '../../../types/character-common'
import type { BackgroundData } from '../../../types/data'
import SectionBanner from '../shared/SectionBanner'

const ABILITY_LABELS: Record<AbilityName, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA'
}

const ABBR_TO_ABILITY: Record<string, AbilityName> = {
  STR: 'strength',
  DEX: 'dexterity',
  CON: 'constitution',
  INT: 'intelligence',
  WIS: 'wisdom',
  CHA: 'charisma'
}

const ELF_KEEN_SENSES_OPTIONS = ['Insight', 'Perception', 'Survival']

// Species that have spellcasting ability choices (INT/WIS/CHA)
const SPECIES_WITH_SPELL_ABILITY_CHOICE = ['elf', 'tiefling', 'gnome']

export default function SpecialAbilitiesTab5e(): JSX.Element {
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const backgroundAbilityBonuses = useBuilderStore((s) => s.backgroundAbilityBonuses)
  const setBackgroundAbilityBonuses = useBuilderStore((s) => s.setBackgroundAbilityBonuses)

  const backgroundSlot = buildSlots.find((s) => s.category === 'background')
  const hasBackground = backgroundSlot?.selectedId != null
  const backgroundId = backgroundSlot?.selectedId ?? null

  const speciesSlot = buildSlots.find((s) => s.category === 'ancestry')
  const speciesId = speciesSlot?.selectedId ?? null
  const speciesSize = useBuilderStore((s) => s.speciesSize)
  const setSpeciesSize = useBuilderStore((s) => s.setSpeciesSize)

  const heritageId = useBuilderStore((s) => s.heritageId)
  const speciesSpellcastingAbility = useBuilderStore((s) => s.speciesSpellcastingAbility)
  const setSpeciesSpellcastingAbility = useBuilderStore((s) => s.setSpeciesSpellcastingAbility)
  const keenSensesSkill = useBuilderStore((s) => s.keenSensesSkill)
  const setKeenSensesSkill = useBuilderStore((s) => s.setKeenSensesSkill)

  const [backgroundData, setBackgroundData] = useState<BackgroundData | null>(null)
  const [sizeOptions, setSizeOptions] = useState<string[] | null>(null)
  const [_hasSubraces, setHasSubraces] = useState(false)
  const [needsSpellAbility, setNeedsSpellAbility] = useState(false)

  // Load background data to get allowed ability scores
  useEffect(() => {
    if (!backgroundId) {
      setBackgroundData(null)
      return
    }
    load5eBackgrounds().then((bgs) => {
      const bg = bgs.find((b) => b.id === backgroundId)
      setBackgroundData(bg ?? null)
    })
  }, [backgroundId])

  // Load species data to check for size choices and subraces
  useEffect(() => {
    if (!speciesId) {
      setSizeOptions(null)
      setHasSubraces(false)
      setNeedsSpellAbility(false)
      return
    }
    load5eSpecies().then((species) => {
      const sp = species.find((s) => s.id === speciesId)
      if (sp && sp.size.type === 'choice' && sp.size.options) {
        setSizeOptions(sp.size.options)
      } else {
        setSizeOptions(null)
      }
      setHasSubraces(!!sp?.traits.some((t) => t.lineageChoices))

      // Check if this species needs a spellcasting ability choice
      if (SPECIES_WITH_SPELL_ABILITY_CHOICE.includes(speciesId)) {
        setNeedsSpellAbility(true)
      } else {
        setNeedsSpellAbility(false)
      }
    })
  }, [speciesId])

  // Determine which abilities are allowed for this background
  const allowedAbilities: AbilityName[] = backgroundData?.abilityScores
    ? backgroundData.abilityScores.map((abbr) => ABBR_TO_ABILITY[abbr]).filter((a): a is AbilityName => !!a)
    : ABILITY_NAMES.slice() // fallback: all abilities

  const isCustomBackground = backgroundId === 'custom'

  const totalBonusPoints = Object.values(backgroundAbilityBonuses).reduce((a, b) => a + b, 0)
  const [bonusMode, setBonusMode] = useState<'2-1' | '1-1-1'>(
    totalBonusPoints === 3 && Object.keys(backgroundAbilityBonuses).length === 3 ? '1-1-1' : '2-1'
  )

  // Reset bonuses if background changes and current bonuses use abilities not in the new background
  useEffect(() => {
    if (!backgroundData) return
    const currentKeys = Object.keys(backgroundAbilityBonuses)
    const hasInvalid = currentKeys.some((key) => !allowedAbilities.includes(key as AbilityName))
    if (hasInvalid) {
      setBackgroundAbilityBonuses({})
    }
  }, [backgroundData, allowedAbilities.includes, backgroundAbilityBonuses, setBackgroundAbilityBonuses]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBonusModeChange = (mode: '2-1' | '1-1-1'): void => {
    setBonusMode(mode)
    setBackgroundAbilityBonuses({})
  }

  const handleSetBonus = (ability: AbilityName, value: number): void => {
    const current = { ...backgroundAbilityBonuses }

    if (bonusMode === '2-1') {
      if (value === 2) {
        for (const key of Object.keys(current)) {
          if (current[key] === 2) delete current[key]
        }
        current[ability] = 2
      } else if (value === 1) {
        for (const key of Object.keys(current)) {
          if (current[key] === 1) delete current[key]
        }
        current[ability] = 1
      }
      if (current[ability] === 2) {
        for (const key of Object.keys(current)) {
          if (key !== ability && current[key] === 2) delete current[key]
        }
      }
    } else {
      if (current[ability]) {
        delete current[ability]
      } else if (Object.keys(current).length < 3) {
        current[ability] = 1
      }
    }
    setBackgroundAbilityBonuses(current)
  }

  if (!hasBackground) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-gray-500">Select a background first to configure ability bonuses.</p>
      </div>
    )
  }

  // Filter abilities to only those allowed by the background
  const displayAbilities = isCustomBackground ? ABILITY_NAMES : allowedAbilities

  // Determine if spellcasting ability picker should show
  // For Elf: show after heritage is selected (Drow/High Elf/Wood Elf all need it)
  // For Tiefling: show after heritage is selected
  // For Gnome: show after heritage is selected
  const showSpellAbilityPicker = needsSpellAbility && heritageId

  return (
    <div>
      <SectionBanner label="BACKGROUND ABILITY BONUSES" />
      <div className="px-4 py-3 space-y-3 border-b border-gray-800">
        <p className="text-xs text-gray-500">
          {isCustomBackground
            ? 'Choose any 3 ability scores for your custom background. Total must equal 3 points.'
            : `Your background grants bonuses to ${allowedAbilities.map((a) => ABILITY_LABELS[a]).join(', ')}. Choose how to distribute 3 points.`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => handleBonusModeChange('2-1')}
            className={`text-xs px-3 py-1 rounded border transition-colors cursor-pointer ${
              bonusMode === '2-1'
                ? 'bg-amber-900/50 border-amber-600 text-amber-300'
                : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}
          >
            +2 / +1
          </button>
          <button
            onClick={() => handleBonusModeChange('1-1-1')}
            className={`text-xs px-3 py-1 rounded border transition-colors cursor-pointer ${
              bonusMode === '1-1-1'
                ? 'bg-amber-900/50 border-amber-600 text-amber-300'
                : 'border-gray-600 text-gray-400 hover:border-gray-400'
            }`}
          >
            +1 / +1 / +1
          </button>
        </div>

        {bonusMode === '2-1' ? (
          <div className="space-y-2">
            <div>
              <span className="text-xs text-gray-500">+2 Bonus</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {displayAbilities.map((ab) => {
                  const is2 = backgroundAbilityBonuses[ab] === 2
                  const is1 = backgroundAbilityBonuses[ab] === 1
                  return (
                    <button
                      key={ab}
                      onClick={() => handleSetBonus(ab, 2)}
                      disabled={is1}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                        is2
                          ? 'bg-amber-600 border-amber-500 text-gray-900 font-bold'
                          : is1
                            ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                            : 'border-gray-600 text-gray-300 hover:border-amber-500'
                      }`}
                    >
                      {ABILITY_LABELS[ab]}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500">+1 Bonus</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {displayAbilities.map((ab) => {
                  const is1 = backgroundAbilityBonuses[ab] === 1
                  const is2 = backgroundAbilityBonuses[ab] === 2
                  return (
                    <button
                      key={ab}
                      onClick={() => handleSetBonus(ab, 1)}
                      disabled={is2}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                        is1
                          ? 'bg-amber-600 border-amber-500 text-gray-900 font-bold'
                          : is2
                            ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                            : 'border-gray-600 text-gray-300 hover:border-amber-500'
                      }`}
                    >
                      {ABILITY_LABELS[ab]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <span className="text-xs text-gray-500">
              Choose 3 abilities for +1 each ({Object.keys(backgroundAbilityBonuses).length}/3)
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {displayAbilities.map((ab) => {
                const selected = !!backgroundAbilityBonuses[ab]
                const maxed = Object.keys(backgroundAbilityBonuses).length >= 3 && !selected
                return (
                  <button
                    key={ab}
                    onClick={() => handleSetBonus(ab, 1)}
                    disabled={maxed}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-amber-600 border-amber-500 text-gray-900 font-bold'
                        : maxed
                          ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                          : 'border-gray-600 text-gray-300 hover:border-amber-500'
                    }`}
                  >
                    {ABILITY_LABELS[ab]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {totalBonusPoints === 3 && <div className="text-xs text-green-400 font-medium">All bonus points assigned.</div>}
      </div>

      {/* Size choice (when species allows multiple sizes) */}
      {sizeOptions && sizeOptions.length > 1 && (
        <>
          <SectionBanner label="SIZE" />
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs text-gray-500 mb-2">Your species can be different sizes. Choose one:</p>
            <div className="flex gap-2">
              {sizeOptions.map((size) => (
                <button
                  key={size}
                  onClick={() => setSpeciesSize(size)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors cursor-pointer ${
                    speciesSize === size
                      ? 'bg-amber-600 border-amber-500 text-white font-semibold'
                      : 'border-gray-600 text-gray-400 hover:border-amber-500'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Species Spellcasting Ability Picker (Elf, Tiefling, Gnome) */}
      {showSpellAbilityPicker && (
        <>
          <SectionBanner label="SPECIES SPELLCASTING ABILITY" />
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs text-gray-500 mb-2">
              Choose the spellcasting ability for your species spells and cantrips:
            </p>
            <div className="flex gap-2">
              {(['intelligence', 'wisdom', 'charisma'] as const).map((ab) => (
                <button
                  key={ab}
                  onClick={() => setSpeciesSpellcastingAbility(ab)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors cursor-pointer ${
                    speciesSpellcastingAbility === ab
                      ? 'bg-purple-600 border-purple-500 text-white font-semibold'
                      : 'border-gray-600 text-gray-400 hover:border-purple-500'
                  }`}
                >
                  {ABILITY_LABELS[ab]}
                </button>
              ))}
            </div>
            {speciesSpellcastingAbility && (
              <div className="text-xs text-purple-400 mt-2">
                Using {speciesSpellcastingAbility.charAt(0).toUpperCase() + speciesSpellcastingAbility.slice(1)} for
                species spells.
              </div>
            )}
          </div>
        </>
      )}

      {/* Elf Keen Senses Skill Picker */}
      {speciesId === 'elf' && (
        <>
          <SectionBanner label="KEEN SENSES" />
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs text-gray-500 mb-2">You have proficiency in one of the following skills:</p>
            <div className="flex gap-2">
              {ELF_KEEN_SENSES_OPTIONS.map((skill) => (
                <button
                  key={skill}
                  onClick={() => setKeenSensesSkill(skill)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors cursor-pointer ${
                    keenSensesSkill === skill
                      ? 'bg-amber-600 border-amber-500 text-white font-semibold'
                      : 'border-gray-600 text-gray-400 hover:border-amber-500'
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
