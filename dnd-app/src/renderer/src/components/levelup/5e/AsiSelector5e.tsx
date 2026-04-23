import { useEffect, useState } from 'react'
import { formatPrerequisites, load5eFeats } from '../../../services/data-provider'
import type { Character5e } from '../../../types/character-5e'
import type { AbilityName, BuildSlot } from '../../../types/character-common'
import { ABILITY_NAMES } from '../../../types/character-common'
import type { FeatData } from '../../../types/data'
import { meetsFeatPrerequisites } from '../../../utils/feat-prerequisites'

/** ASI/Feat toggle: choose either ASI or a General feat at ASI levels */
export function AsiOrFeatSelector5e({
  slot,
  character,
  asiSelection,
  featSelection,
  onAsiSelect,
  onFeatSelect
}: {
  slot: BuildSlot
  character: Character5e
  asiSelection: AbilityName[]
  featSelection: { id: string; name: string; description: string; choices?: Record<string, string | string[]> } | null
  onAsiSelect: (abilities: AbilityName[]) => void
  onFeatSelect: (
    feat: { id: string; name: string; description: string; choices?: Record<string, string | string[]> } | null
  ) => void
}): JSX.Element {
  const [chooseFeat, setChooseFeat] = useState(!!featSelection)

  const handleToggle = (useFeat: boolean): void => {
    setChooseFeat(useFeat)
    if (useFeat) {
      // Clear ASI when switching to feat mode
      onAsiSelect([])
    } else {
      // Clear feat when switching to ASI mode
      onFeatSelect(null)
    }
  }

  const isIncomplete = !featSelection && asiSelection.length === 0

  return (
    <div className={`rounded ${isIncomplete ? 'ring-1 ring-amber-600/50 p-1 -m-1' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-gray-400">{slot.label}:</span>
        {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
        <button
          onClick={() => handleToggle(false)}
          className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
            !chooseFeat ? 'bg-amber-600 text-white' : 'border border-gray-600 text-gray-400'
          }`}
        >
          Ability Score Improvement
        </button>
        <button
          onClick={() => handleToggle(true)}
          className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
            chooseFeat ? 'bg-green-600 text-white' : 'border border-gray-600 text-gray-400'
          }`}
        >
          General Feat
        </button>
      </div>

      {chooseFeat ? (
        <GeneralFeatPicker character={character} selection={featSelection} onSelect={onFeatSelect} />
      ) : (
        <AsiAbilityPicker5e slot={slot} character={character} selection={asiSelection} onSelect={onAsiSelect} />
      )}
    </div>
  )
}

export function GeneralFeatPicker({
  character,
  selection,
  onSelect
}: {
  character: Character5e
  selection: { id: string; name: string; description: string; choices?: Record<string, string | string[]> } | null
  onSelect: (
    feat: { id: string; name: string; description: string; choices?: Record<string, string | string[]> } | null
  ) => void
}): JSX.Element {
  const [feats, setFeats] = useState<FeatData[]>([])
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingChoices, setPendingChoices] = useState<Record<string, string>>({})

  useEffect(() => {
    load5eFeats('General')
      .then(setFeats)
      .catch(() => setFeats([]))
  }, [])

  // Filter out already-taken feats (unless repeatable)
  const takenIds = new Set((character.feats ?? []).map((f) => f.id))
  const filteredFeats = feats.filter((f) => {
    if (takenIds.has(f.id) && !f.repeatable) return false
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Find the feat data for the current selection (for choice config)
  const selectedFeatData = selection ? feats.find((f) => f.id === selection.id) : null
  const choiceConfig = selectedFeatData?.choiceConfig

  if (selection) {
    return (
      <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-2">
        <div className="flex items-center justify-between">
          <span className="text-green-300 font-semibold text-sm">{selection.name}</span>
          <button
            onClick={() => {
              onSelect(null)
              setPendingChoices({})
            }}
            className="text-xs text-gray-500 hover:text-red-400 cursor-pointer"
          >
            Change
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{selection.description}</p>
        {choiceConfig &&
          Object.entries(choiceConfig).map(([key, config]) => (
            <div key={key} className="mt-2">
              <label className="text-xs text-amber-300 block mb-1">{config.label}</label>
              <select
                value={pendingChoices[key] ?? (selection.choices?.[key] as string) ?? ''}
                onChange={(e) => {
                  const newChoices = { ...pendingChoices, [key]: e.target.value }
                  setPendingChoices(newChoices)
                  onSelect({ ...selection, choices: { ...selection.choices, [key]: e.target.value } })
                }}
                className="w-full px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200"
              >
                <option value="">-- Select --</option>
                {config.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-green-400 hover:text-green-300 cursor-pointer"
      >
        {expanded ? 'Hide General Feats' : 'Select a General Feat'}
      </button>
      {expanded && (
        <div className="mt-2">
          <input
            type="text"
            placeholder="Search feats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 mb-2"
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredFeats.map((feat) => {
              const meetsPrereqs = meetsFeatPrerequisites(character, feat.prerequisites)
              return (
                <button
                  key={feat.id}
                  onClick={() => {
                    if (!meetsPrereqs) return
                    onSelect({
                      id: feat.id,
                      name: feat.name,
                      description: feat.benefits.map((b) => b.description).join(' ')
                    })
                    setExpanded(false)
                    setSearch('')
                    setPendingChoices({})
                  }}
                  disabled={!meetsPrereqs}
                  className={`w-full text-left border rounded p-2 transition-colors ${
                    meetsPrereqs
                      ? 'bg-gray-800/50 hover:bg-gray-800 border-gray-700 hover:border-green-600 cursor-pointer'
                      : 'bg-gray-900/50 border-gray-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="text-sm text-green-300 font-medium">
                    {feat.name}
                    {feat.repeatable && <span className="text-xs text-purple-400 ml-1">*</span>}
                  </div>
                  {formatPrerequisites(feat.prerequisites).length > 0 && (
                    <p className={`text-xs ${meetsPrereqs ? 'text-yellow-500' : 'text-red-400'}`}>
                      Requires: {formatPrerequisites(feat.prerequisites).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {feat.benefits.map((b) => b.description).join(' ')}
                  </p>
                </button>
              )
            })}
            {filteredFeats.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-2">No matching feats found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function AsiAbilityPicker5e({
  slot: _slot,
  character,
  selection,
  onSelect
}: {
  slot: BuildSlot
  character: Character5e
  selection: AbilityName[]
  onSelect: (abilities: AbilityName[]) => void
}): JSX.Element {
  const [mode, setMode] = useState<'+2' | '+1/+1'>(selection.length === 1 ? '+2' : '+1/+1')

  const handleModeChange = (newMode: '+2' | '+1/+1'): void => {
    setMode(newMode)
    onSelect([])
  }

  const handleAbilityClick = (ability: AbilityName): void => {
    if (mode === '+2') {
      onSelect([ability, ability])
    } else {
      if (selection.includes(ability)) {
        onSelect(selection.filter((a) => a !== ability))
      } else if (selection.length < 2) {
        onSelect([...selection, ability])
      }
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => handleModeChange('+2')}
          className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
            mode === '+2' ? 'bg-amber-600 text-white' : 'border border-gray-600 text-gray-400'
          }`}
        >
          +2 to one
        </button>
        <button
          onClick={() => handleModeChange('+1/+1')}
          className={`px-2 py-0.5 text-xs rounded cursor-pointer transition-colors ${
            mode === '+1/+1' ? 'bg-amber-600 text-white' : 'border border-gray-600 text-gray-400'
          }`}
        >
          +1 to two
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {ABILITY_NAMES.map((ability) => {
          const score = character.abilityScores[ability]
          const isSelected =
            mode === '+2' ? selection.length >= 2 && selection[0] === ability : selection.includes(ability)
          const atMax = score >= 20

          return (
            <button
              key={ability}
              onClick={() => !atMax && handleAbilityClick(ability)}
              disabled={atMax}
              className={`px-2 py-1 text-xs rounded capitalize transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-amber-600 text-white'
                  : atMax
                    ? 'border border-gray-700 text-gray-600 cursor-not-allowed'
                    : 'border border-gray-600 text-gray-300 hover:border-amber-500 hover:text-amber-400'
              }`}
            >
              {ability.slice(0, 3)} {score}
              {isSelected ? (mode === '+2' ? ' (+2)' : ' (+1)') : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}
