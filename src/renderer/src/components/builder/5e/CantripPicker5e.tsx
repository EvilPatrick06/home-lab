import { useCallback, useMemo } from 'react'
import type { SpellData } from './SpellSummary5e'

export default function CantripPicker5e({
  allSpells,
  selectedCantrips,
  onSelect
}: {
  allSpells: SpellData[]
  selectedCantrips: string[]
  onSelect: (ids: string[]) => void
}): JSX.Element {
  const clericCantrips = useMemo(
    () =>
      allSpells
        .filter((s) => s.level === 0 && s.classes?.includes('cleric'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allSpells]
  )

  const toggleCantrip = useCallback(
    (id: string) => {
      if (selectedCantrips.includes(id)) {
        onSelect(selectedCantrips.filter((c) => c !== id))
      } else if (selectedCantrips.length < 2) {
        onSelect([...selectedCantrips, id])
      }
    },
    [selectedCantrips, onSelect]
  )

  return (
    <div className="border border-blue-700/50 rounded-lg bg-blue-900/10 p-3 mb-3">
      <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">
        Blessed Warrior Cantrips ({selectedCantrips.length}/2)
      </div>
      <p className="text-xs text-gray-500 mb-2">Choose 2 Cleric cantrips. They count as Paladin spells (CHA-based).</p>
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {clericCantrips.map((spell) => {
          const selected = selectedCantrips.includes(spell.id)
          return (
            <button
              key={spell.id}
              onClick={() => toggleCantrip(spell.id)}
              disabled={!selected && selectedCantrips.length >= 2}
              className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors ${
                selected
                  ? 'bg-blue-800/40 text-blue-300'
                  : selectedCantrips.length >= 2
                    ? 'text-gray-600 cursor-not-allowed'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-300 cursor-pointer'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                  selected ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-600'
                }`}
              >
                {selected && '\u2713'}
              </span>
              {spell.name}
              <span className="ml-auto text-xs text-gray-600">{spell.school}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
