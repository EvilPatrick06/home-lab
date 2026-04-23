import { Fragment, useMemo, useState } from 'react'

export interface SpellData {
  id: string
  name: string
  level: number
  school?: string
  castingTime?: string
  castTime?: string
  range?: string
  duration?: string
  concentration?: boolean
  ritual?: boolean
  description: string
  higherLevels?: string
  classes?: string[]
  components?: unknown
}

export function ordinal(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}

export function SpellRow({
  spell,
  selected,
  onToggle,
  isOffList
}: {
  spell: SpellData
  selected: boolean
  onToggle: () => void
  isOffList?: boolean
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-gray-800/50 last:border-0">
      <div className="flex items-center gap-2 px-4 py-1.5 hover:bg-gray-800/30">
        <button
          onClick={onToggle}
          className={`w-4 h-4 rounded border flex items-center justify-center text-xs shrink-0 ${
            selected ? 'bg-amber-600 border-amber-500 text-white' : 'border-gray-600 hover:border-gray-400'
          }`}
        >
          {selected && '\u2713'}
        </button>
        <button onClick={() => setExpanded(!expanded)} className="flex-1 flex items-center justify-between text-left">
          <span className={`text-sm ${selected ? 'text-gray-200' : 'text-gray-400'} flex items-center gap-1.5`}>
            {spell.name}
            {isOffList && (
              <span className="text-[10px] text-orange-400 border border-orange-700 rounded px-1">Off-List</span>
            )}
          </span>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {spell.concentration && <span className="text-yellow-600">C</span>}
            {spell.ritual && <span className="text-blue-500">R</span>}
            <span>{spell.school}</span>
          </div>
        </button>
      </div>
      {expanded && (
        <div className="px-6 pb-2 text-xs text-gray-400 space-y-1">
          <div className="flex gap-3 text-gray-500">
            <span>{spell.castingTime || spell.castTime}</span>
            <span>{spell.range}</span>
            <span>{spell.duration}</span>
          </div>
          <p className="leading-relaxed">{spell.description}</p>
          {spell.higherLevels && (
            <p className="text-gray-500">
              <span className="font-semibold">At Higher Levels:</span> {spell.higherLevels}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function SpellSummary5e({
  selectedSpellIds,
  allSpells,
  onRemove
}: {
  selectedSpellIds: string[]
  allSpells: SpellData[]
  onRemove: (id: string) => void
}): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  const grouped = useMemo(() => {
    const map = new Map<number, SpellData[]>()
    for (const id of selectedSpellIds) {
      const spell = allSpells.find((s) => s.id === id)
      if (spell) {
        const list = map.get(spell.level) ?? []
        list.push(spell)
        map.set(spell.level, list)
      }
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [selectedSpellIds, allSpells])

  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-1.5 bg-amber-900/20 flex items-center justify-between cursor-pointer hover:bg-amber-900/30 transition-colors"
      >
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
          Your Selected Spells ({selectedSpellIds.length})
        </span>
        <span className="text-gray-500 text-[10px]">{collapsed ? '\u25B8' : '\u25BE'}</span>
      </button>
      {!collapsed && (
        <div className="px-4 py-2 space-y-2 max-h-48 overflow-y-auto">
          {grouped.map(([level, spells]) => (
            <Fragment key={level}>
              <div className="text-[10px] font-semibold text-gray-500 uppercase">
                {level === 0 ? 'Cantrips' : `${level}${ordinal(level)} Level`}
              </div>
              {spells.map((spell) => (
                <div key={spell.id} className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-gray-300">{spell.name}</span>
                  <button
                    onClick={() => onRemove(spell.id)}
                    className="text-[10px] text-gray-500 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
