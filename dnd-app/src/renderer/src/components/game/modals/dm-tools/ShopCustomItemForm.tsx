import { useState } from 'react'
import type { ShopItem, ShopItemCategory, ShopItemRarity } from '../../../../network'

import { type PresetDef, RARITY_OPTIONS, SHOP_CATEGORIES } from './shop-utils'

type _PresetDef = PresetDef

interface ShopCustomItemFormProps {
  onAddItem: (item: ShopItem) => void
}

export default function ShopCustomItemForm({ onAddItem }: ShopCustomItemFormProps): JSX.Element {
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customWeight, setCustomWeight] = useState('')
  const [customCategory, setCustomCategory] = useState<ShopItemCategory>('other')
  const [customRarity, setCustomRarity] = useState<ShopItemRarity>('common')
  const [customDescription, setCustomDescription] = useState('')

  const handleAddCustomItem = (): void => {
    if (!customName.trim()) return
    const priceGp = Number.parseFloat(customPrice) || 0
    const item: ShopItem = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      name: customName.trim(),
      category: customCategory,
      price: { gp: priceGp },
      quantity: 10,
      weight: Number.parseFloat(customWeight) || 0,
      shopCategory: customCategory,
      rarity: customRarity,
      description: customDescription.trim() || undefined
    }
    onAddItem(item)
    setCustomName('')
    setCustomPrice('')
    setCustomWeight('')
    setCustomCategory('other')
    setCustomRarity('common')
    setCustomDescription('')
  }

  return (
    <div className="mb-4 border border-gray-700 rounded">
      <button
        onClick={() => setCustomOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-300 cursor-pointer"
      >
        <span>Add Custom Item</span>
        <span>{customOpen ? '\u25B2' : '\u25BC'}</span>
      </button>
      {customOpen && (
        <div className="px-3 pb-3 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-500 mb-0.5">Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Item name"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Price (GP)</label>
              <input
                type="number"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Weight (lb)</label>
              <input
                type="number"
                value={customWeight}
                onChange={(e) => setCustomWeight(e.target.value)}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Category</label>
              <select
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as ShopItemCategory)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
              >
                {SHOP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Rarity</label>
              <select
                value={customRarity}
                onChange={(e) => setCustomRarity(e.target.value as ShopItemRarity)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
              >
                {RARITY_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAddCustomItem}
                disabled={!customName.trim()}
                className="w-full py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded transition-colors cursor-pointer"
              >
                Add Item
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-0.5">Description</label>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Item description..."
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}
