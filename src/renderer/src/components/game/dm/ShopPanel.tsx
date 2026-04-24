import { useEffect, useState } from 'react'
import type { ShopItem } from '../../../network'
import { load5ePoisons } from '../../../services/data-provider'
import { useGameStore } from '../../../stores/use-game-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Poison, Settlement } from '../../../types/dm-toolbox'

type _Settlement = Settlement

const PRESET_ITEMS: ShopItem[] = [
  {
    id: 'healing-potion',
    name: 'Healing Potion',
    category: 'Potion',
    price: { gp: 50 },
    quantity: 10,
    description: 'Heals 2d4+2 HP'
  },
  {
    id: 'greater-healing',
    name: 'Potion of Greater Healing',
    category: 'Potion',
    price: { gp: 150 },
    quantity: 5,
    description: 'Heals 4d4+4 HP'
  },
  {
    id: 'antitoxin',
    name: 'Antitoxin',
    category: 'Potion',
    price: { gp: 50 },
    quantity: 5,
    description: 'Advantage on saving throws against poison for 1 hour'
  },
  { id: 'rope', name: 'Rope, Hempen (50 ft)', category: 'Gear', price: { gp: 1 }, quantity: 10 },
  {
    id: 'torch',
    name: 'Torch',
    category: 'Gear',
    price: { cp: 1 },
    quantity: 20,
    description: 'Bright light 20 ft, dim 20 ft'
  },
  { id: 'rations', name: 'Rations (1 day)', category: 'Gear', price: { sp: 5 }, quantity: 50 },
  { id: 'arrow-20', name: 'Arrows (20)', category: 'Ammunition', price: { gp: 1 }, quantity: 20 },
  { id: 'bolt-20', name: 'Crossbow Bolts (20)', category: 'Ammunition', price: { gp: 1 }, quantity: 20 },
  {
    id: 'longsword',
    name: 'Longsword',
    category: 'Weapon',
    price: { gp: 15 },
    quantity: 3,
    description: '1d8 slashing, versatile (1d10)'
  },
  { id: 'shield', name: 'Shield', category: 'Armor', price: { gp: 10 }, quantity: 5, description: '+2 AC' },
  {
    id: 'chain-mail',
    name: 'Chain Mail',
    category: 'Armor',
    price: { gp: 75 },
    quantity: 2,
    description: 'AC 16, Str 13, stealth disadvantage'
  },
  {
    id: 'studded-leather',
    name: 'Studded Leather',
    category: 'Armor',
    price: { gp: 45 },
    quantity: 3,
    description: 'AC 12 + Dex'
  }
]

function formatPrice(price: ShopItem['price']): string {
  const parts: string[] = []
  if (price.pp) parts.push(`${price.pp} pp`)
  if (price.gp) parts.push(`${price.gp} gp`)
  if (price.sp) parts.push(`${price.sp} sp`)
  if (price.cp) parts.push(`${price.cp} cp`)
  return parts.join(', ') || 'Free'
}

export default function ShopPanel(): JSX.Element {
  const { shopOpen, shopName, shopInventory, openShop, closeShop, addShopItem, removeShopItem } = useGameStore()
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const [shopNameInput, setShopNameInput] = useState(shopName)
  const [showPoisons, setShowPoisons] = useState(false)
  const [poisonPresets, setPoisonPresets] = useState<ShopItem[]>([])

  useEffect(() => {
    if (!showPoisons || poisonPresets.length > 0) return
    load5ePoisons()
      .then((poisons: Poison[]) => {
        setPoisonPresets(
          poisons.map((p) => ({
            id: `poison-${p.id}`,
            name: p.name,
            category: 'Poison' as const,
            price: { gp: parseInt(p.cost, 10) || 100 },
            quantity: 3,
            description: `${p.type} — ${p.effect}`
          }))
        )
      })
      .catch(() => setPoisonPresets([]))
  }, [showPoisons, poisonPresets.length])

  const handleOpenShop = (): void => {
    openShop(shopNameInput || 'General Store')
    sendMessage('dm:shop-update', { shopInventory, shopName: shopNameInput || 'General Store' })
  }

  const handleCloseShop = (): void => {
    closeShop()
    sendMessage('dm:shop-update', { shopInventory: [], shopName: '' })
  }

  const handleAddPreset = (item: ShopItem): void => {
    const existing = shopInventory.find((i) => i.id === item.id)
    if (!existing) {
      addShopItem({ ...item })
    }
  }

  const handleBroadcastInventory = (): void => {
    sendMessage('dm:shop-update', { shopInventory, shopName })
  }

  return (
    <div className="p-3">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2">Shop</h3>

      {!shopOpen ? (
        <div className="space-y-2">
          <input
            type="text"
            value={shopNameInput}
            onChange={(e) => setShopNameInput(e.target.value)}
            placeholder="Shop name..."
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={handleOpenShop}
            className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded transition-colors cursor-pointer"
          >
            Open Shop
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-400 font-medium">{shopName}</span>
            <button onClick={handleCloseShop} className="text-xs text-red-400 hover:text-red-300 cursor-pointer">
              Close Shop
            </button>
          </div>

          {/* Current inventory */}
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {shopInventory.length === 0 && (
              <p className="text-xs text-gray-500">No items in shop. Add from presets below.</p>
            )}
            {shopInventory.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1 text-xs">
                <div>
                  <span className="text-gray-200">{item.name}</span>
                  <span className="text-gray-500 ml-1">({formatPrice(item.price)})</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400">x{item.quantity}</span>
                  <button
                    onClick={() => removeShopItem(item.id)}
                    className="text-red-400 hover:text-red-300 ml-1 cursor-pointer"
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add presets */}
          <div className="border-t border-gray-700 pt-2">
            <span className="text-xs text-gray-500">Add Items:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_ITEMS.filter((p) => !shopInventory.some((i) => i.id === p.id)).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleAddPreset(item)}
                  className="text-[10px] px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 hover:text-amber-300 hover:border-amber-600 cursor-pointer"
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          {/* Poisons */}
          <div className="border-t border-gray-700 pt-2">
            <button
              onClick={() => setShowPoisons(!showPoisons)}
              className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer"
            >
              {showPoisons ? 'Hide' : 'Show'} Poisons ({poisonPresets.length || '...'})
            </button>
            {showPoisons && (
              <div className="flex flex-wrap gap-1 mt-1">
                {poisonPresets
                  .filter((p) => !shopInventory.some((i) => i.id === p.id))
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleAddPreset(item)}
                      className="text-[10px] px-1.5 py-0.5 bg-purple-900/30 border border-purple-700/50 rounded text-purple-400 hover:text-purple-300 hover:border-purple-500 cursor-pointer"
                      title={item.description}
                    >
                      {item.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <button
            onClick={handleBroadcastInventory}
            className="w-full py-1 bg-green-700 hover:bg-green-600 text-white text-xs font-medium rounded transition-colors cursor-pointer"
          >
            Update Players
          </button>
        </div>
      )}
    </div>
  )
}
