import { useMemo, useState } from 'react'
import type { ShopItem, ShopItemCategory, ShopItemRarity } from '../../../../network'

import { applyMarkup, formatPrice, RARITY_COLORS, RARITY_OPTIONS, SHOP_CATEGORIES } from './shop-utils'

type SortKey = 'name' | 'price' | 'category'

interface ShopInventoryTableProps {
  shopInventory: ShopItem[]
  shopMarkup: number
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<ShopItem>) => void
}

export default function ShopInventoryTable({
  shopInventory,
  shopMarkup,
  onRemove,
  onUpdate
}: ShopInventoryTableProps): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [filterCategory, setFilterCategory] = useState<ShopItemCategory | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)

  // Sort & filter inventory
  const displayInventory = useMemo(() => {
    let items = [...shopInventory]
    if (filterCategory !== 'all') {
      items = items.filter((i) => i.shopCategory === filterCategory)
    }
    items.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'price': {
          const aTotal = (a.price.pp ?? 0) * 1000 + (a.price.gp ?? 0) * 100 + (a.price.sp ?? 0) * 10 + (a.price.cp ?? 0)
          const bTotal = (b.price.pp ?? 0) * 1000 + (b.price.gp ?? 0) * 100 + (b.price.sp ?? 0) * 10 + (b.price.cp ?? 0)
          return aTotal - bTotal
        }
        case 'category':
          return (a.shopCategory ?? 'other').localeCompare(b.shopCategory ?? 'other')
        default:
          return 0
      }
    })
    return items
  }, [shopInventory, filterCategory, sortKey])

  return (
    <>
      {/* Inventory table header: sort + filter */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Inventory ({shopInventory.length} items)
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as ShopItemCategory | 'all')}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Categories</option>
            {SHOP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <div className="flex text-[10px] gap-0.5">
            {(['name', 'price', 'category'] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`px-1.5 py-0.5 rounded cursor-pointer ${
                  sortKey === key ? 'bg-amber-600/30 text-amber-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inventory table */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5 mb-3">
        {displayInventory.length === 0 && (
          <p className="text-xs text-gray-500 italic py-4 text-center">
            No items in shop. Use presets, import, or add custom items above.
          </p>
        )}
        {displayInventory.map((item) => {
          const isEditing = editingId === item.id
          const markedUpPrice = applyMarkup(item.price, shopMarkup)
          const stock =
            item.stockLimit != null
              ? `${item.stockRemaining ?? item.stockLimit}/${item.stockLimit}`
              : `x${item.quantity}`

          return (
            <div
              key={item.id}
              className={`rounded text-xs ${item.isHidden ? 'bg-gray-800/30 border border-dashed border-gray-700' : 'bg-gray-800/50'}`}
            >
              <div className="flex items-center px-3 py-1.5 gap-2">
                {/* Name */}
                <span
                  className={`flex-1 min-w-0 truncate ${item.isHidden ? 'text-gray-500 line-through' : 'text-gray-200'}`}
                  title={item.description}
                >
                  {item.name}
                  {item.dmNotes && (
                    <span className="text-red-400 ml-1" title={`DM: ${item.dmNotes}`}>
                      *
                    </span>
                  )}
                </span>
                {/* Price (with markup) */}
                <span className="text-amber-400 shrink-0 w-20 text-right">{formatPrice(markedUpPrice)}</span>
                {/* Weight */}
                <span className="text-gray-500 shrink-0 w-10 text-right">{item.weight ? `${item.weight}lb` : '-'}</span>
                {/* Category */}
                <span className="text-gray-500 shrink-0 w-20 truncate">{item.shopCategory ?? item.category}</span>
                {/* Rarity */}
                <span
                  className={`shrink-0 w-16 truncate ${item.rarity ? RARITY_COLORS[item.rarity] : 'text-gray-600'}`}
                >
                  {item.rarity ?? '-'}
                </span>
                {/* Stock */}
                <span className="text-gray-400 shrink-0 w-12 text-right">{stock}</span>
                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditingId(isEditing ? null : item.id)}
                    className="text-gray-500 hover:text-amber-400 cursor-pointer"
                    title="Edit"
                  >
                    {isEditing ? '\u2713' : '\u270E'}
                  </button>
                  <button
                    onClick={() => onUpdate(item.id, { isHidden: !item.isHidden })}
                    className={`cursor-pointer ${item.isHidden ? 'text-red-400 hover:text-green-400' : 'text-gray-500 hover:text-red-400'}`}
                    title={item.isHidden ? 'Show to players' : 'Hide from players'}
                  >
                    {item.isHidden ? '\u25CB' : '\u25CF'}
                  </button>
                  <button
                    onClick={() => onRemove(item.id)}
                    className="text-red-400 hover:text-red-300 cursor-pointer"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Inline edit row */}
              {isEditing && (
                <div className="px-3 pb-2 space-y-1.5 border-t border-gray-700/50 pt-1.5">
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Price (GP)</label>
                      <input
                        type="number"
                        defaultValue={item.price.gp ?? 0}
                        onBlur={(e) => {
                          const gp = Number.parseFloat(e.target.value) || 0
                          onUpdate(item.id, { price: { ...item.price, gp } })
                        }}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Stock Limit</label>
                      <input
                        type="number"
                        defaultValue={item.stockLimit ?? ''}
                        placeholder="Unlimited"
                        onBlur={(e) => {
                          const val = e.target.value.trim()
                          if (val === '') {
                            onUpdate(item.id, {
                              stockLimit: undefined,
                              stockRemaining: undefined
                            })
                          } else {
                            const limit = Math.max(0, Number.parseInt(val, 10) || 0)
                            onUpdate(item.id, {
                              stockLimit: limit,
                              stockRemaining: Math.min(item.stockRemaining ?? limit, limit)
                            })
                          }
                        }}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Quantity</label>
                      <input
                        type="number"
                        defaultValue={item.quantity}
                        onBlur={(e) => {
                          const qty = Math.max(0, Number.parseInt(e.target.value, 10) || 0)
                          onUpdate(item.id, { quantity: qty })
                        }}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">Rarity</label>
                      <select
                        defaultValue={item.rarity ?? 'common'}
                        onChange={(e) => onUpdate(item.id, { rarity: e.target.value as ShopItemRarity })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 focus:outline-none focus:border-amber-500"
                      >
                        {RARITY_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">DM Notes (hidden from players)</label>
                    <input
                      type="text"
                      defaultValue={item.dmNotes ?? ''}
                      placeholder='e.g. "cursed", "stolen goods"'
                      onBlur={(e) => onUpdate(item.id, { dmNotes: e.target.value.trim() || undefined })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
