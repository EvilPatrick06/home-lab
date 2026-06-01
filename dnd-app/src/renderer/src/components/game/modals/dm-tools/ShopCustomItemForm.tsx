import { useState } from 'react'
import { useT } from '../../../../i18n'
import type { ShopItem, ShopItemCategory, ShopItemRarity } from '../../../../network'

import { type PresetDef, RARITY_OPTIONS, SHOP_CATEGORIES } from './shop-utils'

type _PresetDef = PresetDef

interface ShopCustomItemFormProps {
  onAddItem: (item: ShopItem) => void
}

export default function ShopCustomItemForm({ onAddItem }: ShopCustomItemFormProps): JSX.Element {
  const { t } = useT()
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
    <div className="mb-4 border border-border rounded">
      <button
        onClick={() => setCustomOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide hover:text-gray-300 cursor-pointer"
      >
        <span>{t('game.shopCustomItemForm.addCustomItem')}</span>
        <span>{customOpen ? '\u25B2' : '\u25BC'}</span>
      </button>
      {customOpen && (
        <div className="px-3 pb-3 space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-0.5">{t('game.shopCustomItemForm.name')}</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t('game.shopCustomItemForm.namePlaceholder')}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">{t('game.shopCustomItemForm.price')}</label>
              <input
                type="number"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="0"
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">{t('game.shopCustomItemForm.weight')}</label>
              <input
                type="number"
                value={customWeight}
                onChange={(e) => setCustomWeight(e.target.value)}
                placeholder="0"
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">{t('game.shopCustomItemForm.category')}</label>
              <select
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as ShopItemCategory)}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-amber-500"
              >
                {SHOP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">{t('game.shopCustomItemForm.rarity')}</label>
              <select
                value={customRarity}
                onChange={(e) => setCustomRarity(e.target.value as ShopItemRarity)}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-amber-500"
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
                className="w-full py-1 bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded transition-colors cursor-pointer"
              >
                {t('game.shopCustomItemForm.addItem')}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">{t('game.shopCustomItemForm.description')}</label>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder={t('game.shopCustomItemForm.descriptionPlaceholder')}
              rows={2}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}
