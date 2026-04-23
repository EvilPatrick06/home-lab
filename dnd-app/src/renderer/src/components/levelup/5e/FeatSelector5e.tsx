import { useCallback, useEffect, useMemo, useState } from 'react'
import { addToast } from '../../../hooks/use-toast'
import { formatPrerequisites, load5eFeats, load5eSpells } from '../../../services/data-provider'
import { useLevelUpStore } from '../../../stores/use-level-up-store'
import type { Character5e } from '../../../types/character-5e'
import type { BuildSlot } from '../../../types/character-common'
import type { FeatData } from '../../../types/data'
import { meetsFeatPrerequisites } from '../../../utils/feat-prerequisites'
import { logger } from '../../../utils/logger'

export function EpicBoonSelector5e({
  slot,
  selection,
  onSelect,
  character
}: {
  slot: BuildSlot
  selection: { id: string; name: string; description: string } | null
  onSelect: (sel: { id: string; name: string; description: string } | null) => void
  character: Character5e
}): JSX.Element {
  const [feats, setFeats] = useState<FeatData[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    load5eFeats('Epic Boon')
      .then(setFeats)
      .catch((err) => {
        logger.error('Failed to load epic boons', err)
        addToast('Failed to load epic boons', 'error')
        setFeats([])
      })
  }, [])

  const isIncomplete = !selection

  return (
    <div className={`rounded ${isIncomplete ? 'ring-1 ring-amber-600/50 p-1 -m-1' : ''}`}>
      <div className="text-sm text-gray-400 mb-1 flex items-center gap-2">
        {slot.label}:
        {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
      </div>
      {selection ? (
        <div className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="text-purple-300 font-semibold text-sm">{selection.name}</span>
            <button onClick={() => onSelect(null)} className="text-xs text-gray-500 hover:text-red-400 cursor-pointer">
              Change
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{selection.description}</p>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer"
          >
            {expanded ? 'Hide Epic Boons' : 'Select an Epic Boon'}
          </button>
          {expanded && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {feats.map((feat) => {
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
                    }}
                    disabled={!meetsPrereqs}
                    className={`w-full text-left border rounded p-2 transition-colors ${meetsPrereqs ? 'bg-gray-800/50 hover:bg-gray-800 border-gray-700 hover:border-purple-600 cursor-pointer' : 'bg-gray-900/30 border-gray-800 opacity-50 cursor-not-allowed'}`}
                  >
                    <div className="text-sm text-purple-300 font-medium">{feat.name}</div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {feat.benefits.map((b) => b.description).join(' ')}
                    </p>
                    {!meetsPrereqs && formatPrerequisites(feat.prerequisites).length > 0 && (
                      <p className="text-[10px] text-red-400 mt-0.5">
                        Requires: {formatPrerequisites(feat.prerequisites).join(', ')}
                      </p>
                    )}
                  </button>
                )
              })}
              {feats.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No Epic Boon feats found.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BlessedWarriorCantripPicker(): JSX.Element {
  const blessedWarriorCantrips = useLevelUpStore((s) => s.blessedWarriorCantrips)
  const setBlessedWarriorCantrips = useLevelUpStore((s) => s.setBlessedWarriorCantrips)
  const [allSpells, setAllSpells] = useState<
    Array<{ id: string; name: string; level: number; school?: string; classes?: string[] }>
  >([])

  useEffect(() => {
    load5eSpells()
      .then(setAllSpells)
      .catch((err) => {
        logger.error('Failed to load spells', err)
        addToast('Failed to load spells', 'error')
        setAllSpells([])
      })
  }, [])

  const clericCantrips = useMemo(
    () =>
      allSpells
        .filter((s) => s.level === 0 && s.classes?.includes('cleric'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allSpells]
  )

  const toggleCantrip = useCallback(
    (id: string) => {
      if (blessedWarriorCantrips.includes(id)) {
        setBlessedWarriorCantrips(blessedWarriorCantrips.filter((c) => c !== id))
      } else if (blessedWarriorCantrips.length < 2) {
        setBlessedWarriorCantrips([...blessedWarriorCantrips, id])
      }
    },
    [blessedWarriorCantrips, setBlessedWarriorCantrips]
  )

  return (
    <div className="mt-2 border border-blue-700/50 rounded-lg bg-blue-900/10 p-2">
      <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">
        Choose 2 Cleric Cantrips ({blessedWarriorCantrips.length}/2)
      </div>
      <div className="max-h-36 overflow-y-auto space-y-0.5">
        {clericCantrips.map((spell) => {
          const selected = blessedWarriorCantrips.includes(spell.id)
          return (
            <button
              key={spell.id}
              onClick={() => toggleCantrip(spell.id)}
              disabled={!selected && blessedWarriorCantrips.length >= 2}
              className={`w-full text-left flex items-center gap-2 px-2 py-0.5 rounded text-xs transition-colors ${
                selected
                  ? 'bg-blue-800/40 text-blue-300'
                  : blessedWarriorCantrips.length >= 2
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:bg-gray-800/50 cursor-pointer'
              }`}
            >
              <span
                className={`w-3 h-3 rounded border flex items-center justify-center text-[9px] shrink-0 ${
                  selected ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-600'
                }`}
              >
                {selected && '\u2713'}
              </span>
              {spell.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DruidicWarriorCantripPicker(): JSX.Element {
  const druidicWarriorCantrips = useLevelUpStore((s) => s.druidicWarriorCantrips)
  const setDruidicWarriorCantrips = useLevelUpStore((s) => s.setDruidicWarriorCantrips)
  const [allSpells, setAllSpells] = useState<
    Array<{ id: string; name: string; level: number; school?: string; classes?: string[] }>
  >([])

  useEffect(() => {
    load5eSpells()
      .then(setAllSpells)
      .catch((err) => {
        logger.error('Failed to load spells', err)
        addToast('Failed to load spells', 'error')
        setAllSpells([])
      })
  }, [])

  const druidCantrips = useMemo(
    () =>
      allSpells
        .filter((s) => s.level === 0 && s.classes?.includes('druid'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allSpells]
  )

  const toggleCantrip = useCallback(
    (id: string) => {
      if (druidicWarriorCantrips.includes(id)) {
        setDruidicWarriorCantrips(druidicWarriorCantrips.filter((c) => c !== id))
      } else if (druidicWarriorCantrips.length < 2) {
        setDruidicWarriorCantrips([...druidicWarriorCantrips, id])
      }
    },
    [druidicWarriorCantrips, setDruidicWarriorCantrips]
  )

  return (
    <div className="mt-2 border border-green-700/50 rounded-lg bg-green-900/10 p-2">
      <div className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">
        Choose 2 Druid Cantrips ({druidicWarriorCantrips.length}/2)
      </div>
      <div className="max-h-36 overflow-y-auto space-y-0.5">
        {druidCantrips.map((spell) => {
          const selected = druidicWarriorCantrips.includes(spell.id)
          return (
            <button
              key={spell.id}
              onClick={() => toggleCantrip(spell.id)}
              disabled={!selected && druidicWarriorCantrips.length >= 2}
              className={`w-full text-left flex items-center gap-2 px-2 py-0.5 rounded text-xs transition-colors ${
                selected
                  ? 'bg-green-800/40 text-green-300'
                  : druidicWarriorCantrips.length >= 2
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:bg-gray-800/50 cursor-pointer'
              }`}
            >
              <span
                className={`w-3 h-3 rounded border flex items-center justify-center text-[9px] shrink-0 ${
                  selected ? 'bg-green-600 border-green-500 text-white' : 'border-gray-600'
                }`}
              >
                {selected && '\u2713'}
              </span>
              {spell.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function FightingStyleSelector5e({
  slot,
  character,
  selection,
  onSelect
}: {
  slot: BuildSlot
  character: Character5e
  selection: { id: string; name: string; description: string } | null
  onSelect: (sel: { id: string; name: string; description: string } | null) => void
}): JSX.Element {
  const [feats, setFeats] = useState<FeatData[]>([])
  const [expanded, setExpanded] = useState(false)

  const isRanger = character.buildChoices.classId === 'ranger' || character.classes[0]?.name.toLowerCase() === 'ranger'

  useEffect(() => {
    load5eFeats('Fighting Style')
      .then((all) => {
        // Filter class-restricted fighting styles
        const classId = character.buildChoices.classId
        setFeats(
          all.filter((f) => {
            const prereqs = formatPrerequisites(f.prerequisites)
            return prereqs.length === 0 || prereqs.some((p) => p.toLowerCase().includes(classId))
          })
        )
      })
      .catch((err) => {
        logger.error('Failed to load fighting style feats', err)
        addToast('Failed to load fighting styles', 'error')
        setFeats([])
      })
  }, [character.buildChoices.classId])

  // Filter out already-taken fighting styles
  const takenIds = new Set((character.feats ?? []).map((f) => f.id))
  const available: Array<{ id: string; name: string; description: string }> = [
    ...feats
      .filter((f) => !takenIds.has(f.id))
      .map((f) => ({
        id: f.id,
        name: f.name,
        description: f.benefits.map((b) => b.description).join(' ')
      })),
    ...(isRanger
      ? [
          {
            id: 'druidic-warrior',
            name: 'Druidic Warrior',
            description:
              'You learn two Druid cantrips of your choice (Guidance and Starry Wisp are recommended). The chosen cantrips count as Ranger spells for you, and Wisdom is your spellcasting ability for them. Whenever you gain a Ranger level, you can replace one of these cantrips with another Druid cantrip.'
          }
        ]
      : [])
  ]

  const isBlessedWarrior = selection?.id === 'fighting-style-blessed-warrior'
  const isDruidicWarrior = selection?.id === 'druidic-warrior'
  const isIncomplete = !selection

  return (
    <div className={`rounded ${isIncomplete ? 'ring-1 ring-amber-600/50 p-1 -m-1' : ''}`}>
      <div className="text-sm text-gray-400 mb-1 flex items-center gap-2">
        {slot.label}:
        {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
      </div>
      {selection ? (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="text-blue-300 font-semibold text-sm">{selection.name}</span>
            <button onClick={() => onSelect(null)} className="text-xs text-gray-500 hover:text-red-400 cursor-pointer">
              Change
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{selection.description}</p>
          {isBlessedWarrior && <BlessedWarriorCantripPicker />}
          {isDruidicWarrior && <DruidicWarriorCantripPicker />}
        </div>
      ) : (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            {expanded ? 'Hide Fighting Styles' : 'Select a Fighting Style'}
          </button>
          {expanded && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {available.map((feat) => (
                <button
                  key={feat.id}
                  onClick={() => {
                    onSelect({ id: feat.id, name: feat.name, description: feat.description })
                    setExpanded(false)
                  }}
                  className="w-full text-left bg-gray-800/50 hover:bg-gray-800 border border-gray-700 hover:border-blue-600 rounded p-2 cursor-pointer transition-colors"
                >
                  <div className="text-sm text-blue-300 font-medium">{feat.name}</div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{feat.description}</p>
                </button>
              ))}
              {available.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">No Fighting Style feats available.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
