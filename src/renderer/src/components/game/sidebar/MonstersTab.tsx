import { useEffect, useMemo, useState } from 'react'
import type { MonsterStatBlock } from '../../../types/monster'

export default function MonstersTab(): JSX.Element {
  const [monsters, setMonsters] = useState<MonsterStatBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [crFilter, setCrFilter] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.game.loadMonsters().then((data) => {
      if (!cancelled) {
        setMonsters(data as MonsterStatBlock[])
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const crValues = useMemo(() => {
    const crs = new Set(monsters.map((m) => m.cr))
    return ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))].filter((cr) =>
      crs.has(cr)
    )
  }, [monsters])

  const filtered = useMemo(() => {
    let result = monsters
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((m) => m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q))
    }
    if (crFilter) {
      result = result.filter((m) => m.cr === crFilter)
    }
    return result.slice(0, 100)
  }, [monsters, search, crFilter])

  if (loading) return <p className="text-xs text-gray-500 text-center py-4">Loading monsters...</p>

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search monsters..."
        className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500/60"
      />

      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setCrFilter(null)}
          className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
            crFilter === null ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          All CR
        </button>
        {crValues.slice(0, 15).map((cr) => (
          <button
            key={cr}
            onClick={() => setCrFilter(crFilter === cr ? null : cr)}
            className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
              crFilter === cr ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {cr}
          </button>
        ))}
      </div>

      <div className="text-[10px] text-gray-500">
        {filtered.length} monster{filtered.length !== 1 ? 's' : ''}
        {filtered.length === 100 ? '+' : ''}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No matching monsters</p>
        ) : (
          filtered.map((m) => <MonsterCard key={m.id} monster={m} />)
        )}
      </div>
    </div>
  )
}

function MonsterCard({ monster }: { monster: MonsterStatBlock }): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/30 cursor-pointer hover:border-gray-600/50 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-amber-400 truncate">{monster.name}</div>
        <div className="text-[10px] text-gray-500 shrink-0">CR {monster.cr}</div>
      </div>
      <div className="text-[10px] text-gray-400 mt-0.5">
        {monster.size} {monster.type}
        {monster.tags?.length ? ` (${monster.tags.join(', ')})` : ''}
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-700/30 space-y-1">
          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px]">
            <span className="text-gray-500">AC</span>
            <span className="text-gray-300 col-span-2">
              {monster.ac}
              {monster.acType ? ` (${monster.acType})` : ''}
            </span>
            <span className="text-gray-500">HP</span>
            <span className="text-gray-300 col-span-2">
              {monster.hp} ({monster.hitDice})
            </span>
            <span className="text-gray-500">Speed</span>
            <span className="text-gray-300 col-span-2">
              {monster.speed.walk}ft
              {monster.speed.fly ? `, fly ${monster.speed.fly}ft` : ''}
              {monster.speed.swim ? `, swim ${monster.speed.swim}ft` : ''}
            </span>
          </div>
          <div className="flex gap-2 text-[10px] mt-1">
            <span className="text-gray-500">STR {monster.abilityScores.str}</span>
            <span className="text-gray-500">DEX {monster.abilityScores.dex}</span>
            <span className="text-gray-500">CON {monster.abilityScores.con}</span>
            <span className="text-gray-500">INT {monster.abilityScores.int}</span>
            <span className="text-gray-500">WIS {monster.abilityScores.wis}</span>
            <span className="text-gray-500">CHA {monster.abilityScores.cha}</span>
          </div>
        </div>
      )}
    </div>
  )
}
