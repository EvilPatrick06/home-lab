import { useEffect, useMemo, useState } from 'react'
import type { ShopItem } from '../../../../network'
import { load5eEquipment, load5eMagicItems } from '../../../../services/data-provider'
import type { EquipmentFile, MagicItemData } from '../../../../types/data'
import { logger } from '../../../../utils/logger'

import {
  armorToImportable,
  formatPrice,
  gearToImportable,
  type ImportableItem,
  importableToShopItem,
  magicItemToImportable,
  RARITY_COLORS,
  weaponToImportable
} from './shop-utils'

interface ShopImportModalProps {
  importMode: 'equipment' | 'magic'
  onClose: () => void
  onImport: (items: ShopItem[]) => void
}

export default function ShopImportModal({ importMode, onClose, onImport }: ShopImportModalProps): JSX.Element {
  const [equipmentData, setEquipmentData] = useState<EquipmentFile | null>(null)
  const [magicItemsData, setMagicItemsData] = useState<MagicItemData[]>([])
  const [importSearch, setImportSearch] = useState('')
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set())

  // Load data on demand
  useEffect(() => {
    if (importMode === 'equipment' && !equipmentData) {
      load5eEquipment()
        .then(setEquipmentData)
        .catch((e) => logger.warn('[ShopImport] Failed to load equipment', e))
    }
    if (importMode === 'magic' && magicItemsData.length === 0) {
      load5eMagicItems()
        .then(setMagicItemsData)
        .catch((e) => logger.warn('[ShopImport] Failed to load magic items', e))
    }
  }, [importMode, equipmentData, magicItemsData.length])

  // Derive importable list
  const importableItems = useMemo((): ImportableItem[] => {
    if (importMode === 'equipment' && equipmentData) {
      return [
        ...equipmentData.weapons.map(weaponToImportable),
        ...equipmentData.armor.map(armorToImportable),
        ...equipmentData.gear.map(gearToImportable)
      ]
    }
    if (importMode === 'magic') {
      return magicItemsData.map(magicItemToImportable)
    }
    return []
  }, [importMode, equipmentData, magicItemsData])

  const filteredImports = useMemo(() => {
    if (!importSearch.trim()) return importableItems
    const q = importSearch.toLowerCase()
    return importableItems.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
  }, [importableItems, importSearch])

  const handleImportSelected = (): void => {
    const items: ShopItem[] = []
    for (const item of filteredImports) {
      if (selectedImports.has(item.id)) {
        items.push(importableToShopItem(item, importMode === 'magic' ? 1 : 10))
      }
    }
    onImport(items)
  }

  const toggleImportSelection = (id: string): void => {
    setSelectedImports((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[44rem] max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-amber-400">
            {importMode === 'equipment' ? 'Import from Equipment' : 'Import from Magic Items'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none cursor-pointer">
            &times;
          </button>
        </div>

        <input
          type="text"
          value={importSearch}
          onChange={(e) => setImportSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 mb-3"
        />

        <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5">
          {filteredImports.length === 0 && (
            <p className="text-xs text-gray-500 italic py-4 text-center">
              {importableItems.length === 0 ? 'Loading data...' : 'No items match your search.'}
            </p>
          )}
          {filteredImports.slice(0, 200).map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-2 bg-gray-800/50 hover:bg-gray-800 rounded px-3 py-1.5 text-xs cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedImports.has(item.id)}
                onChange={() => toggleImportSelection(item.id)}
                className="accent-amber-500"
              />
              <span className="flex-1 min-w-0 truncate text-gray-200">{item.name}</span>
              <span className="text-gray-500 shrink-0">{formatPrice(item.price)}</span>
              {item.rarity && <span className={`shrink-0 ${RARITY_COLORS[item.rarity]}`}>{item.rarity}</span>}
              <span className="text-gray-600 shrink-0">{item.category}</span>
            </label>
          ))}
          {filteredImports.length > 200 && (
            <p className="text-xs text-gray-500 text-center py-2">
              Showing first 200 of {filteredImports.length} results. Narrow your search.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
          <span className="text-xs text-gray-400">{selectedImports.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleImportSelected}
              disabled={selectedImports.size === 0}
              className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer"
            >
              Add Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
