import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { trigger3dDice } from '../../../components/game/dice3d'
import type { HaggleRequestPayload, ShopItem, ShopItemCategory } from '../../../network'
import { rollSingle } from '../../../services/dice/dice-service'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'

interface TransactionRecord {
  id: string
  type: 'buy' | 'sell' | 'haggle'
  itemName: string
  price: ShopItem['price']
  timestamp: number
  result?: string
}

const CATEGORY_LABELS: Record<ShopItemCategory | 'all', string> = {
  all: 'All',
  weapon: 'Weapons',
  armor: 'Armor',
  potion: 'Potions',
  scroll: 'Scrolls',
  wondrous: 'Wondrous',
  tool: 'Tools',
  adventuring: 'Adventuring',
  trade: 'Trade Goods',
  other: 'Other'
}

function formatPrice(price: ShopItem['price']): string {
  const parts: string[] = []
  if (price.pp) parts.push(`${price.pp} pp`)
  if (price.gp) parts.push(`${price.gp} gp`)
  if (price.sp) parts.push(`${price.sp} sp`)
  if (price.cp) parts.push(`${price.cp} cp`)
  return parts.join(', ') || 'Free'
}

function priceInCp(price: ShopItem['price']): number {
  return (price.pp ?? 0) * 1000 + (price.gp ?? 0) * 100 + (price.sp ?? 0) * 10 + (price.cp ?? 0)
}

function cpToPrice(cp: number): ShopItem['price'] {
  const pp = Math.floor(cp / 1000)
  cp %= 1000
  const gp = Math.floor(cp / 100)
  cp %= 100
  const sp = Math.floor(cp / 10)
  cp %= 10
  return { pp: pp || undefined, gp: gp || undefined, sp: sp || undefined, cp: cp || undefined }
}

function canAfford(character: Character, price: ShopItem['price']): boolean {
  const treasure = is5eCharacter(character) ? character.treasure : null
  if (!treasure) return false
  const charTotal = (treasure.pp ?? 0) * 1000 + (treasure.gp ?? 0) * 100 + (treasure.sp ?? 0) * 10 + (treasure.cp ?? 0)
  return charTotal >= priceInCp(price)
}

function deductCurrency(character: Character, price: ShopItem['price']): Character {
  if (!is5eCharacter(character)) return character
  const treasure = { ...character.treasure }
  let totalCp = (treasure.pp ?? 0) * 1000 + (treasure.gp ?? 0) * 100 + (treasure.sp ?? 0) * 10 + (treasure.cp ?? 0)
  totalCp -= priceInCp(price)
  treasure.pp = Math.floor(totalCp / 1000)
  totalCp %= 1000
  treasure.gp = Math.floor(totalCp / 100)
  totalCp %= 100
  treasure.sp = Math.floor(totalCp / 10)
  totalCp %= 10
  treasure.cp = totalCp
  return { ...character, treasure, updatedAt: new Date().toISOString() } as Character
}

function addCurrency(character: Character, price: ShopItem['price']): Character {
  if (!is5eCharacter(character)) return character
  const treasure = { ...character.treasure }
  let totalCp = (treasure.pp ?? 0) * 1000 + (treasure.gp ?? 0) * 100 + (treasure.sp ?? 0) * 10 + (treasure.cp ?? 0)
  totalCp += priceInCp(price)
  treasure.pp = Math.floor(totalCp / 1000)
  totalCp %= 1000
  treasure.gp = Math.floor(totalCp / 100)
  totalCp %= 100
  treasure.sp = Math.floor(totalCp / 10)
  totalCp %= 10
  treasure.cp = totalCp
  return { ...character, treasure, updatedAt: new Date().toISOString() } as Character
}

export default function ShopView(): JSX.Element | null {
  const { shopOpen, shopName, shopInventory, closeShop } = useGameStore(
    useShallow((s) => ({
      shopOpen: s.shopOpen,
      shopName: s.shopName,
      shopInventory: s.shopInventory,
      closeShop: s.closeShop
    }))
  )
  const characters = useCharacterStore((s) => s.characters)
  const saveCharacter = useCharacterStore((s) => s.saveCharacter)
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const localPeerId = useNetworkStore((s) => s.localPeerId)

  const [activeTab, setActiveTab] = useState<'buy' | 'sell' | 'history'>('buy')
  const [categoryFilter, setCategoryFilter] = useState<ShopItemCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [haggleDisabledItems, setHaggleDisabledItems] = useState<Set<string>>(new Set())
  const [hagglePending, setHagglePending] = useState<string | null>(null)

  const localChar =
    characters.find((c) => c.playerId === 'local' || c.playerId === localPeerId) ?? characters[0] ?? null

  if (!shopOpen || shopInventory.length === 0) return null

  // Filter visible items (not hidden from this player)
  const visibleItems = shopInventory.filter((item) => {
    if (item.isHidden) return false
    if (item.hiddenFromPlayerIds?.includes(localPeerId ?? '')) return false
    if (item.stockRemaining !== undefined && item.stockRemaining <= 0) return false
    return true
  })

  // Apply category and search filters
  const filteredItems = visibleItems.filter((item) => {
    if (categoryFilter !== 'all' && item.shopCategory !== categoryFilter) return false
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  // Get unique categories for filter tabs
  const availableCategories = new Set(visibleItems.map((i) => i.shopCategory).filter(Boolean))

  const handleBuy = async (item: ShopItem): Promise<void> => {
    if (!localChar || !canAfford(localChar, item.price)) return
    const updated = deductCurrency(localChar, item.price)
    const equipment = [...updated.equipment, { name: item.name, quantity: 1 }]
    const withItem = { ...updated, equipment } as Character
    await saveCharacter(withItem)
    sendMessage('player:buy-item', { itemId: item.id, itemName: item.name, price: item.price })
    setTransactions((prev) => [
      { id: crypto.randomUUID(), type: 'buy', itemName: item.name, price: item.price, timestamp: Date.now() },
      ...prev
    ])
  }

  const handleSell = async (itemName: string): Promise<void> => {
    if (!localChar || !is5eCharacter(localChar)) return
    const equipItem = localChar.equipment.find((e) => e.name === itemName)
    if (!equipItem) return

    // Find item in shop for reference price, or use a default
    const shopItem = shopInventory.find((si) => si.name.toLowerCase() === itemName.toLowerCase())
    const sellbackRate = 0.5 // 50% value
    const baseCp = shopItem ? priceInCp(shopItem.price) : 100 // default 1 gp if not in shop
    const sellPriceCp = Math.floor(baseCp * sellbackRate)
    const sellPrice = cpToPrice(sellPriceCp)

    const updated = addCurrency(localChar, sellPrice)
    const equipment = [...updated.equipment]
    const idx = equipment.findIndex((e) => e.name === itemName)
    if (idx >= 0) {
      if (equipment[idx].quantity > 1) {
        equipment[idx] = { ...equipment[idx], quantity: equipment[idx].quantity - 1 }
      } else {
        equipment.splice(idx, 1)
      }
    }
    const withUpdated = { ...updated, equipment } as Character
    await saveCharacter(withUpdated)
    sendMessage('player:sell-item', { itemName, price: sellPrice })
    setTransactions((prev) => [
      {
        id: crypto.randomUUID(),
        type: 'sell',
        itemName,
        price: sellPrice,
        timestamp: Date.now(),
        result: `Sold for ${formatPrice(sellPrice)}`
      },
      ...prev
    ])
  }

  const handleHaggle = (item: ShopItem): void => {
    if (haggleDisabledItems.has(item.id) || hagglePending) return
    // Roll Persuasion check
    const roll = rollSingle(20)
    const chaMod = localChar && is5eCharacter(localChar) ? Math.floor((localChar.abilityScores.charisma - 10) / 2) : 0
    const profBonus =
      localChar && is5eCharacter(localChar)
        ? localChar.skills?.find((s) => s.name === 'Persuasion')
          ? Math.ceil(localChar.level / 4) + 1
          : 0
        : 0
    const total = roll + chaMod + profBonus
    trigger3dDice({ formula: '1d20', rolls: [roll], total, rollerName: localChar?.name ?? 'Player' })

    setHagglePending(item.id)
    const hagglePayload: HaggleRequestPayload = {
      itemId: item.id,
      itemName: item.name,
      originalPrice: item.price,
      persuasionRoll: roll,
      persuasionModifier: chaMod + profBonus,
      persuasionTotal: total
    }
    sendMessage('player:haggle-request', hagglePayload)

    // Auto-resolve locally after timeout (DM may not respond)
    setTimeout(() => {
      setHagglePending((current) => (current === item.id ? null : current))
      // Haggling disabled for this item after one attempt
      setHaggleDisabledItems((prev) => new Set([...prev, item.id]))
    }, 10000)

    setTransactions((prev) => [
      {
        id: crypto.randomUUID(),
        type: 'haggle',
        itemName: item.name,
        price: item.price,
        timestamp: Date.now(),
        result: `Persuasion: ${roll} + ${chaMod + profBonus} = ${total}`
      },
      ...prev
    ])
  }

  // Player's current gold display
  const playerGold =
    localChar && is5eCharacter(localChar)
      ? `${localChar.treasure.pp ?? 0} pp, ${localChar.treasure.gp ?? 0} gp, ${localChar.treasure.sp ?? 0} sp, ${localChar.treasure.cp ?? 0} cp`
      : 'N/A'

  // Sellable equipment from character
  const sellableItems = localChar && is5eCharacter(localChar) ? localChar.equipment.filter((e) => e.quantity > 0) : []

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <h3 className="text-sm font-semibold text-amber-400">{shopName}</h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-400">Purse: {playerGold}</span>
          <button onClick={closeShop} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
            &#10005;
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-700/50">
        {(['buy', 'sell', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-xs font-semibold transition-colors cursor-pointer capitalize ${
              activeTab === tab ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Buy tab */}
      {activeTab === 'buy' && (
        <div className="p-2 space-y-2">
          {/* Search + Category filter */}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ShopItemCategory | 'all')}
              className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="all">All</option>
              {Array.from(availableCategories).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat as ShopItemCategory] ?? cat}
                </option>
              ))}
            </select>
          </div>

          {/* Items list */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-3">No items available</p>
            ) : (
              filteredItems.map((item) => {
                const affordable = localChar ? canAfford(localChar, item.price) : false
                const isOutOfStock = item.stockRemaining !== undefined && item.stockRemaining <= 0
                const canHaggle = !haggleDisabledItems.has(item.id) && hagglePending !== item.id
                return (
                  <div key={item.id} className="bg-gray-800/50 rounded px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-gray-200 truncate">{item.name}</span>
                          {item.rarity && item.rarity !== 'common' && (
                            <span className="text-[9px] text-purple-400 shrink-0">({item.rarity})</span>
                          )}
                        </div>
                        {item.description && <p className="text-[10px] text-gray-500 truncate">{item.description}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        <span className="text-xs text-amber-400">{formatPrice(item.price)}</span>
                        {item.stockRemaining !== undefined && (
                          <span className="text-[9px] text-gray-500">({item.stockRemaining} left)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={() => handleBuy(item)}
                        disabled={!affordable || isOutOfStock}
                        className={`text-[10px] px-2 py-0.5 rounded cursor-pointer ${
                          affordable && !isOutOfStock
                            ? 'bg-green-700 hover:bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Buy
                      </button>
                      <button
                        onClick={() => handleHaggle(item)}
                        disabled={!canHaggle}
                        className={`text-[10px] px-2 py-0.5 rounded cursor-pointer ${
                          canHaggle
                            ? 'bg-amber-700 hover:bg-amber-600 text-white'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {hagglePending === item.id ? 'Haggling...' : 'Haggle'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Sell tab */}
      {activeTab === 'sell' && (
        <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
          <p className="text-[10px] text-gray-500 mb-1">Sell items at 50% value</p>
          {sellableItems.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">No items to sell</p>
          ) : (
            sellableItems.map((item, idx) => {
              const shopRef = shopInventory.find((si) => si.name.toLowerCase() === item.name.toLowerCase())
              const baseCp = shopRef ? priceInCp(shopRef.price) : 100
              const sellPrice = cpToPrice(Math.floor(baseCp * 0.5))
              return (
                <div
                  key={`${item.name}-${idx}`}
                  className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-200">{item.name}</span>
                    <span className="text-[10px] text-gray-500 ml-1.5">x{item.quantity}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className="text-xs text-amber-400">{formatPrice(sellPrice)}</span>
                    <button
                      onClick={() => handleSell(item.name)}
                      className="text-[10px] px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-white cursor-pointer"
                    >
                      Sell 1
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
          {transactions.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">No transactions yet</p>
          ) : (
            transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-semibold uppercase px-1 py-0.5 rounded ${
                      tx.type === 'buy'
                        ? 'bg-green-900/40 text-green-400'
                        : tx.type === 'sell'
                          ? 'bg-amber-900/40 text-amber-400'
                          : 'bg-purple-900/40 text-purple-400'
                    }`}
                  >
                    {tx.type}
                  </span>
                  <span className="text-xs text-gray-300">{tx.itemName}</span>
                </div>
                <div className="text-[10px] text-gray-500">{tx.result ?? formatPrice(tx.price)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
