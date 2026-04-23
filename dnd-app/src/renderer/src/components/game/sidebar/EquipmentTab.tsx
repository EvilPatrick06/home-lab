import { useEffect, useState } from 'react'
import type { EquipmentFile } from '../../../types/data'

interface ItemWithCategory {
  name: string
  category: string
  details: string
}

export default function EquipmentTab(): JSX.Element {
  const [equipment, setEquipment] = useState<EquipmentFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'weapons' | 'armor' | 'gear'>('all')

  useEffect(() => {
    let cancelled = false
    window.api.game.loadEquipment().then((data: unknown) => {
      if (!cancelled) {
        setEquipment(data as EquipmentFile)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const allItems: ItemWithCategory[] = equipment
    ? [
        ...equipment.weapons.map((w) => ({
          name: w.name,
          category: 'weapon',
          details: `${w.damage ?? ''} ${w.damageType ?? ''}`.trim()
        })),
        ...equipment.armor.map((a) => ({ name: a.name, category: 'armor', details: `AC ${a.baseAC}` })),
        ...equipment.gear.map((g) => ({ name: g.name, category: 'gear', details: g.description ?? '' }))
      ]
    : []

  const filtered = allItems.filter((item) => {
    if (
      categoryFilter !== 'all' &&
      categoryFilter !== item.category &&
      (categoryFilter !== 'weapons' || item.category !== 'weapon')
    )
      return false
    if (search.trim()) return item.name.toLowerCase().includes(search.trim().toLowerCase())
    return true
  })

  if (loading) {
    return <p className="text-xs text-gray-500 text-center py-4">Loading equipment...</p>
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search equipment..."
        className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500/60"
      />

      <div className="flex gap-1">
        {['all', 'weapons', 'armor', 'gear'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat as 'all' | 'weapons' | 'armor' | 'gear')}
            className={`px-2 py-0.5 text-[10px] font-semibold rounded cursor-pointer capitalize transition-colors ${
              categoryFilter === cat
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="text-[10px] text-gray-500">
        {filtered.length} item{filtered.length !== 1 ? 's' : ''}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No matching equipment</p>
        ) : (
          filtered.map((item, i) => (
            <div key={`${item.name}-${i}`} className="bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/30">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-amber-400 truncate">{item.name}</div>
                <span className="text-[10px] text-gray-500 shrink-0">{item.category}</span>
              </div>
              {item.details && <p className="text-[11px] text-gray-300 mt-0.5 leading-relaxed">{item.details}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
