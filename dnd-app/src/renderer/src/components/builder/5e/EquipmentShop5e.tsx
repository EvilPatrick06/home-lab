import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef, useState } from 'react'
import type { EquipmentDatabase } from './gear-tab-types'

interface ShopItem {
  name: string
  type: 'weapon' | 'armor' | 'gear'
  category: string
  cost: string
  detail: string
}

function buildShopItems(db: EquipmentDatabase): ShopItem[] {
  const items: ShopItem[] = []
  for (const w of db.weapons) {
    const props = w.properties ?? []
    items.push({
      name: w.name,
      type: 'weapon',
      category: w.category,
      cost: w.cost ?? '',
      detail: `${w.damage} ${w.damageType}${props.length > 0 ? ` | ${props.join(', ')}` : ''}`
    })
  }
  for (const a of db.armor) {
    const acStr = a.dexBonus
      ? a.dexBonusMax !== null
        ? `AC ${a.baseAC} + DEX (max ${a.dexBonusMax})`
        : `AC ${a.baseAC} + DEX`
      : `AC ${a.baseAC}`
    items.push({ name: a.name, type: 'armor', category: a.category, cost: a.cost ?? '', detail: acStr })
  }
  for (const g of db.gear) {
    items.push({
      name: g.name,
      type: 'gear',
      category: g.category ?? '',
      cost: g.cost ?? '',
      detail: g.description
    })
  }
  return items
}

const SHOP_TYPE_FILTERS = ['all', 'weapon', 'armor', 'gear'] as const

export default function EquipmentShop5e({
  equipDb,
  onAdd,
  onClose
}: {
  equipDb: EquipmentDatabase
  onAdd: (name: string, cost: string) => void
  onClose: () => void
}): JSX.Element {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'weapon' | 'armor' | 'gear'>('all')

  const shopItems = useMemo(() => buildShopItems(equipDb), [equipDb])
  const filtered = useMemo(
    () =>
      shopItems.filter((item) => {
        if (typeFilter !== 'all' && item.type !== typeFilter) return false
        if (search) {
          const q = search.toLowerCase()
          return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
        }
        return true
      }),
    [shopItems, typeFilter, search]
  )
  const shopParentRef = useRef<HTMLDivElement>(null)
  const shopVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => shopParentRef.current,
    estimateSize: () => 40,
    overscan: 10
  })

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700">
        <span className="text-xs font-bold tracking-widest text-amber-400 uppercase">Equipment Shop</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-sm px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
        >
          Close
        </button>
      </div>

      <div className="px-3 py-2 border-b border-gray-800 space-y-2">
        <input
          type="text"
          placeholder="Search equipment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full text-sm bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-gray-200 placeholder:text-gray-500 outline-none focus:border-amber-500/50"
        />
        <div className="flex gap-1">
          {SHOP_TYPE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                typeFilter === f
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div ref={shopParentRef} className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 italic px-3 py-4 text-center">No items match your search.</p>
        ) : (
          <div style={{ height: `${shopVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {shopVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = filtered[virtualItem.index]
              return (
                <div
                  key={`${item.type}-${item.name}-${virtualItem.index}`}
                  data-index={virtualItem.index}
                  ref={shopVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`
                  }}
                >
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800/50 hover:bg-gray-800/40">
                    <div className="min-w-0 flex-1 mr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200 truncate">{item.name}</span>
                        <span className="text-[10px] text-gray-500 shrink-0">{item.cost}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">{item.detail}</div>
                    </div>
                    <button
                      onClick={() => onAdd(item.name, item.cost)}
                      className="text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded px-2 py-0.5 shrink-0 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
