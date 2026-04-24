import { useCallback, useState } from 'react'
import type { ShopItem } from '../../../../network'
import { load5eEquipment, load5eMagicItems } from '../../../../services/data-provider'
import { useGameStore } from '../../../../stores/use-game-store'
import { useNetworkStore } from '../../../../stores/use-network-store'
import type { ArmorData, EquipmentFile, GearData, MagicItemData, WeaponData } from '../../../../types/data'
import ShopCustomItemForm from './ShopCustomItemForm'
import ShopImportModal from './ShopImportModal'
import ShopInventoryTable from './ShopInventoryTable'
import {
  applyMarkup,
  armorToImportable,
  gearToImportable,
  importableToShopItem,
  magicItemToImportable,
  PRESETS,
  weaponToImportable
} from './shop-utils'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DMShopModalProps {
  onClose: () => void
}

export default function DMShopModal({ onClose }: DMShopModalProps): JSX.Element {
  const {
    shopOpen,
    shopName,
    shopInventory,
    shopMarkup,
    openShop,
    closeShop,
    addShopItem,
    removeShopItem,
    setShopInventory,
    setShopMarkup,
    updateShopItem
  } = useGameStore()
  const sendMessage = useNetworkStore((s) => s.sendMessage)

  // Local UI state
  const [shopNameInput, setShopNameInput] = useState(shopName || 'General Store')
  const [importMode, setImportMode] = useState<'none' | 'equipment' | 'magic'>('none')

  // Cached data for presets (loaded on demand)
  const [equipmentData, setEquipmentData] = useState<EquipmentFile | null>(null)
  const [magicItemsData, setMagicItemsData] = useState<MagicItemData[]>([])

  // Preset loading
  const loadPreset = useCallback(
    async (presetKey: string, replace: boolean) => {
      const preset = PRESETS[presetKey]
      if (!preset) return

      const equipment = equipmentData ?? (await load5eEquipment())
      if (!equipmentData) setEquipmentData(equipment)
      const magicItems = magicItemsData.length > 0 ? magicItemsData : await load5eMagicItems()
      if (magicItemsData.length === 0) setMagicItemsData(magicItems)

      const items: ShopItem[] = []

      const matchWeapon = (name: string): WeaponData | undefined =>
        equipment.weapons.find((w) => w.name.toLowerCase() === name.toLowerCase())
      const matchArmor = (name: string): ArmorData | undefined =>
        equipment.armor.find((a) => a.name.toLowerCase() === name.toLowerCase())
      const matchGear = (name: string): GearData | undefined =>
        equipment.gear.find((g) => g.name.toLowerCase() === name.toLowerCase())
      const matchMagic = (name: string): MagicItemData | undefined =>
        magicItems.find((m) => m.name.toLowerCase() === name.toLowerCase())

      for (const wName of preset.weaponNames) {
        const w = matchWeapon(wName)
        if (w) items.push(importableToShopItem(weaponToImportable(w), 5))
      }
      for (const aName of preset.armorNames) {
        const a = matchArmor(aName)
        if (a) items.push(importableToShopItem(armorToImportable(a), 3))
      }
      for (const gName of preset.gearNames) {
        const g = matchGear(gName)
        if (g) items.push(importableToShopItem(gearToImportable(g), 20))
      }
      for (const mName of preset.magicItemNames) {
        const m = matchMagic(mName)
        if (m) items.push(importableToShopItem(magicItemToImportable(m), 1))
      }

      if (replace) {
        setShopInventory(items)
      } else {
        for (const item of items) {
          addShopItem(item)
        }
      }
    },
    [equipmentData, magicItemsData, setShopInventory, addShopItem]
  )

  /** Build the player-facing inventory by stripping DM-only fields and applying markup. */
  const buildPlayerInventory = (inventory: typeof shopInventory, markup: number) =>
    inventory
      .filter((i) => !i.isHidden)
      .map((i) => ({
        ...i,
        price: applyMarkup(i.price, markup),
        dmNotes: undefined,
        hiddenFromPlayerIds: undefined,
        isHidden: undefined
      }))

  // Broadcast
  const handleBroadcast = (): void => {
    sendMessage('dm:shop-update', { shopInventory: buildPlayerInventory(shopInventory, shopMarkup), shopName })
  }

  const handleOpenShop = (): void => {
    const name = shopNameInput || 'General Store'
    openShop(name)
    sendMessage('dm:shop-update', { shopInventory: buildPlayerInventory(shopInventory, shopMarkup), shopName: name })
  }

  const handleCloseShop = (): void => {
    closeShop()
    sendMessage('dm:shop-update', { shopInventory: [], shopName: '' })
  }

  const handleImport = (items: ShopItem[]): void => {
    for (const item of items) {
      addShopItem(item)
    }
    setImportMode('none')
  }

  // =========================================================================
  // Import sub-modal
  // =========================================================================
  if (importMode !== 'none') {
    return <ShopImportModal importMode={importMode} onClose={() => setImportMode('none')} onImport={handleImport} />
  }

  // =========================================================================
  // Main modal
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[56rem] max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-amber-400">Shop Management</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none cursor-pointer">
            &times;
          </button>
        </div>

        {/* Top bar: name, markup, broadcast */}
        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Shop Name</label>
            <input
              type="text"
              value={shopNameInput}
              onChange={(e) => {
                setShopNameInput(e.target.value)
                if (shopOpen) openShop(e.target.value)
              }}
              placeholder="General Store"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="w-48">
            <label className="block text-xs text-gray-400 mb-1">Markup: {Math.round(shopMarkup * 100)}%</label>
            <input
              type="range"
              min={50}
              max={200}
              value={Math.round(shopMarkup * 100)}
              onChange={(e) => setShopMarkup(Number(e.target.value) / 100)}
              className="w-full accent-amber-500"
            />
          </div>
          <div className="flex gap-2">
            {!shopOpen ? (
              <button
                onClick={handleOpenShop}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors cursor-pointer whitespace-nowrap"
              >
                Open for Players
              </button>
            ) : (
              <>
                <button
                  onClick={handleBroadcast}
                  className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  Broadcast
                </button>
                <button
                  onClick={handleCloseShop}
                  className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-red-200 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  Close Shop
                </button>
              </>
            )}
          </div>
        </div>

        {shopOpen && <span className="text-xs text-green-400 mb-2 block">Shop is open for players</span>}

        {/* Presets */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Load Preset Inventory</h3>
          <div className="flex flex-wrap gap-1">
            {Object.entries(PRESETS).map(([key, def]) => (
              <div key={key} className="flex">
                <button
                  onClick={() => loadPreset(key, true)}
                  title="Replace current inventory"
                  className="text-[11px] px-2 py-1 bg-gray-800 border border-gray-700 rounded-l text-gray-300 hover:text-amber-300 hover:border-amber-600 cursor-pointer"
                >
                  {def.label}
                </button>
                <button
                  onClick={() => loadPreset(key, false)}
                  title="Add to current inventory"
                  className="text-[11px] px-1.5 py-1 bg-gray-800 border border-l-0 border-gray-700 rounded-r text-gray-500 hover:text-green-400 hover:border-green-600 cursor-pointer"
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Custom item creator */}
        <ShopCustomItemForm onAddItem={addShopItem} />

        {/* Import buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setImportMode('equipment')}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs rounded cursor-pointer"
          >
            Import from Equipment
          </button>
          <button
            onClick={() => setImportMode('magic')}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs rounded cursor-pointer"
          >
            Import from Magic Items
          </button>
        </div>

        {/* Inventory table */}
        <ShopInventoryTable
          shopInventory={shopInventory}
          shopMarkup={shopMarkup}
          onRemove={removeShopItem}
          onUpdate={updateShopItem}
        />
      </div>
    </div>
  )
}
