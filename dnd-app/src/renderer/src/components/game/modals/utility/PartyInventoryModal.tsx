import { useCallback, useMemo, useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../../stores/use-network-store'
import type { PartyInventoryItem } from '../../../../types/game-state'

interface PartyInventoryModalProps {
  isDM: boolean
  onClose: () => void
}

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-300',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  'very-rare': 'text-purple-400',
  legendary: 'text-orange-400',
  artifact: 'text-red-400'
}

const CURRENCY_LABELS = [
  { key: 'pp' as const, label: 'PP', color: 'text-gray-200' },
  { key: 'gp' as const, label: 'GP', color: 'text-yellow-400' },
  { key: 'ep' as const, label: 'EP', color: 'text-gray-400' },
  { key: 'sp' as const, label: 'SP', color: 'text-gray-300' },
  { key: 'cp' as const, label: 'CP', color: 'text-amber-600' }
]

export default function PartyInventoryModal({ isDM, onClose }: PartyInventoryModalProps): JSX.Element {
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const players = useLobbyStore((s) => s.players)
  const partyInventory = useGameStore((s) => s.partyInventory)
  const addPartyItem = useGameStore((s) => s.addPartyItem)
  const removePartyItem = useGameStore((s) => s.removePartyItem)
  const updatePartyItemQuantity = useGameStore((s) => s.updatePartyItemQuantity)
  const addPartyCurrency = useGameStore((s) => s.addPartyCurrency)
  const spendPartyCurrency = useGameStore((s) => s.spendPartyCurrency)
  const transferItemToPlayer = useGameStore((s) => s.transferItemToPlayer)
  const splitGold = useGameStore((s) => s.splitGold)

  const [searchFilter, setSearchFilter] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  // Add item form state
  const [newName, setNewName] = useState('')
  const [newQuantity, setNewQuantity] = useState('1')
  const [newWeight, setNewWeight] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newRarity, setNewRarity] = useState<PartyInventoryItem['rarity']>('common')
  const [newDescription, setNewDescription] = useState('')
  const [newAttunement, setNewAttunement] = useState(false)

  // Currency add/spend state
  const [currencyAmounts, setCurrencyAmounts] = useState<Record<string, string>>({
    cp: '',
    sp: '',
    ep: '',
    gp: '',
    pp: ''
  })

  const filteredItems = useMemo(() => {
    if (!searchFilter.trim()) return partyInventory.items
    const q = searchFilter.toLowerCase()
    return partyInventory.items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.rarity?.toLowerCase().includes(q)
    )
  }, [partyInventory.items, searchFilter])

  const totalWeight = useMemo(
    () => partyInventory.items.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0),
    [partyInventory.items]
  )

  const totalValue = useMemo(
    () => partyInventory.items.reduce((sum, item) => sum + (item.value ?? 0) * item.quantity, 0),
    [partyInventory.items]
  )

  const resetAddForm = useCallback(() => {
    setNewName('')
    setNewQuantity('1')
    setNewWeight('')
    setNewValue('')
    setNewRarity('common')
    setNewDescription('')
    setNewAttunement(false)
    setShowAddForm(false)
  }, [])

  const handleAddItem = useCallback(() => {
    if (!newName.trim()) return
    const item: PartyInventoryItem = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      quantity: Math.max(1, parseInt(newQuantity, 10) || 1),
      weight: newWeight ? parseFloat(newWeight) : undefined,
      value: newValue ? parseFloat(newValue) : undefined,
      rarity: newRarity,
      description: newDescription.trim() || undefined,
      attunement: newAttunement || undefined
    }
    addPartyItem(item)
    sendMessage('game:state-patch', { partyInventory: useGameStore.getState().partyInventory })
    resetAddForm()
  }, [
    newName,
    newQuantity,
    newWeight,
    newValue,
    newRarity,
    newDescription,
    newAttunement,
    addPartyItem,
    sendMessage,
    resetAddForm
  ])

  const handleRemoveItem = useCallback(
    (itemId: string) => {
      removePartyItem(itemId)
      sendMessage('game:state-patch', { partyInventory: useGameStore.getState().partyInventory })
    },
    [removePartyItem, sendMessage]
  )

  const handleQuantityChange = useCallback(
    (itemId: string, delta: number) => {
      const item = partyInventory.items.find((i) => i.id === itemId)
      if (!item) return
      const newQty = Math.max(0, item.quantity + delta)
      if (newQty === 0) {
        removePartyItem(itemId)
      } else {
        updatePartyItemQuantity(itemId, newQty)
      }
      sendMessage('game:state-patch', { partyInventory: useGameStore.getState().partyInventory })
    },
    [partyInventory.items, removePartyItem, updatePartyItemQuantity, sendMessage]
  )

  const handleTransfer = useCallback(
    (itemId: string, playerId: string) => {
      transferItemToPlayer(itemId, playerId)
      sendMessage('game:state-patch', { partyInventory: useGameStore.getState().partyInventory })
    },
    [transferItemToPlayer, sendMessage]
  )

  const handleAddCurrency = useCallback(() => {
    const amounts: Record<string, number> = {}
    let hasAmount = false
    for (const [key, val] of Object.entries(currencyAmounts)) {
      const num = parseInt(val, 10)
      if (num > 0) {
        amounts[key] = num
        hasAmount = true
      }
    }
    if (!hasAmount) return
    addPartyCurrency(amounts)
    sendMessage('game:state-patch', { partyInventory: useGameStore.getState().partyInventory })
    setCurrencyAmounts({ cp: '', sp: '', ep: '', gp: '', pp: '' })
  }, [currencyAmounts, addPartyCurrency, sendMessage])

  const handleSpendCurrency = useCallback(() => {
    const amounts: Record<string, number> = {}
    let hasAmount = false
    for (const [key, val] of Object.entries(currencyAmounts)) {
      const num = parseInt(val, 10)
      if (num > 0) {
        amounts[key] = num
        hasAmount = true
      }
    }
    if (!hasAmount) return
    const ok = spendPartyCurrency(amounts)
    if (ok) {
      sendMessage('game:state-patch', { partyInventory: useGameStore.getState().partyInventory })
      setCurrencyAmounts({ cp: '', sp: '', ep: '', gp: '', pp: '' })
    }
  }, [currencyAmounts, spendPartyCurrency, sendMessage])

  const handleSplitGold = useCallback(() => {
    const count = players.length
    if (count <= 0) return
    const perPlayer = splitGold(count)
    if (perPlayer > 0) {
      sendMessage('game:state-patch', { partyInventory: useGameStore.getState().partyInventory })
    }
  }, [players.length, splitGold, sendMessage])

  const getPlayerName = useCallback(
    (playerId: string): string => {
      const player = players.find((p) => p.peerId === playerId || p.characterId === playerId)
      return player?.displayName ?? 'Unknown'
    },
    [players]
  )

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-3xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-200">Party Inventory</h3>
            <span className="text-[10px] text-gray-500">
              {partyInventory.items.length} item{partyInventory.items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Currency section */}
        <div className="border border-gray-700/50 rounded-lg p-3 mb-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Currency</span>
            {isDM && players.length > 0 && (
              <button
                onClick={handleSplitGold}
                className="px-2 py-0.5 text-[10px] bg-yellow-900/30 hover:bg-yellow-800/40 text-yellow-400 border border-yellow-700/30 rounded cursor-pointer"
                title={`Split gold evenly among ${players.length} players`}
              >
                Split Gold ({players.length})
              </button>
            )}
          </div>

          {/* Current totals */}
          <div className="flex items-center gap-3 mb-2">
            {CURRENCY_LABELS.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-1">
                <span className={`text-xs font-semibold ${color}`}>{partyInventory.currency[key]}</span>
                <span className="text-[10px] text-gray-500">{label}</span>
              </div>
            ))}
          </div>

          {/* Add/Spend controls */}
          {isDM && (
            <div className="flex items-end gap-1.5">
              {CURRENCY_LABELS.map(({ key, label }) => (
                <div key={key} className="flex flex-col items-center">
                  <span className="text-[9px] text-gray-500 mb-0.5">{label}</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={currencyAmounts[key]}
                    onChange={(e) => setCurrencyAmounts((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-14 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none focus:border-amber-500/50 text-center"
                  />
                </div>
              ))}
              <button
                onClick={handleAddCurrency}
                className="px-2 py-1 text-[10px] bg-green-900/30 hover:bg-green-800/40 text-green-400 border border-green-700/30 rounded cursor-pointer whitespace-nowrap"
              >
                Add
              </button>
              <button
                onClick={handleSpendCurrency}
                className="px-2 py-1 text-[10px] bg-red-900/30 hover:bg-red-800/40 text-red-400 border border-red-700/30 rounded cursor-pointer whitespace-nowrap"
              >
                Spend
              </button>
            </div>
          )}
        </div>

        {/* Search + Add button */}
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <input
            type="text"
            placeholder="Search items..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50"
          />
          {isDM && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer whitespace-nowrap"
            >
              {showAddForm ? 'Cancel' : '+ Add Item'}
            </button>
          )}
        </div>

        {/* Add item form */}
        {showAddForm && isDM && (
          <div className="border border-gray-700/50 rounded-lg p-3 mb-2 shrink-0 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <input
                  type="text"
                  placeholder="Item name *"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50"
                />
              </div>
              <input
                type="number"
                min="1"
                placeholder="Qty"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="Weight (lb)"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="Value (GP)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50"
              />
              <select
                value={newRarity}
                onChange={(e) => setNewRarity(e.target.value as PartyInventoryItem['rarity'])}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none cursor-pointer"
              >
                <option value="common">Common</option>
                <option value="uncommon">Uncommon</option>
                <option value="rare">Rare</option>
                <option value="very-rare">Very Rare</option>
                <option value="legendary">Legendary</option>
                <option value="artifact">Artifact</option>
              </select>
            </div>
            <textarea
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500/50 resize-y"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAttunement}
                  onChange={(e) => setNewAttunement(e.target.checked)}
                  className="rounded border-gray-600 cursor-pointer"
                />
                Requires Attunement
              </label>
              <button
                onClick={handleAddItem}
                disabled={!newName.trim()}
                className="px-3 py-1 text-[10px] bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer"
              >
                Add to Inventory
              </button>
            </div>
          </div>
        )}

        {/* Items list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredItems.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">
              {searchFilter ? 'No items match your search.' : 'No items in party inventory.'}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-900/95">
                <tr className="border-b border-gray-700/50 text-[10px] text-gray-500 uppercase tracking-wider">
                  <th className="text-left py-1.5 px-2">Name</th>
                  <th className="text-center py-1.5 px-1 w-12">Qty</th>
                  <th className="text-right py-1.5 px-1 w-14">Wt.</th>
                  <th className="text-right py-1.5 px-1 w-16">Value</th>
                  <th className="text-left py-1.5 px-2 w-24">Assigned</th>
                  <th className="py-1.5 px-1 w-20" />
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-800/40 hover:bg-gray-800/30 transition-colors group"
                  >
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-medium ${RARITY_COLORS[item.rarity ?? 'common']}`}>{item.name}</span>
                        {item.attunement && (
                          <span className="text-[9px] text-purple-400 border border-purple-700/30 rounded px-1">
                            ATT
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[10px] text-gray-500 truncate max-w-[250px]">{item.description}</p>
                      )}
                    </td>
                    <td className="text-center py-1.5 px-1">
                      <div className="flex items-center justify-center gap-0.5">
                        {isDM && (
                          <button
                            onClick={() => handleQuantityChange(item.id, -1)}
                            className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300 rounded hover:bg-gray-700 cursor-pointer text-[10px]"
                          >
                            -
                          </button>
                        )}
                        <span className="text-gray-200 min-w-[16px] text-center">{item.quantity}</span>
                        {isDM && (
                          <button
                            onClick={() => handleQuantityChange(item.id, 1)}
                            className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300 rounded hover:bg-gray-700 cursor-pointer text-[10px]"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="text-right py-1.5 px-1 text-gray-400">
                      {item.weight != null ? `${(item.weight * item.quantity).toFixed(1)}` : '-'}
                    </td>
                    <td className="text-right py-1.5 px-1 text-yellow-400/80">
                      {item.value != null ? `${(item.value * item.quantity).toFixed(1)}` : '-'}
                    </td>
                    <td className="py-1.5 px-2">
                      {isDM ? (
                        <select
                          value={item.assignedTo ?? ''}
                          onChange={(e) => handleTransfer(item.id, e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 outline-none cursor-pointer"
                        >
                          <option value="">Unassigned</option>
                          {players.map((p) => (
                            <option key={p.peerId} value={p.peerId}>
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          {item.assignedTo ? getPlayerName(item.assignedTo) : '-'}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-right">
                      {isDM && (
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="px-1.5 py-0.5 text-[10px] bg-red-900/30 hover:bg-red-800/40 text-red-400 border border-red-700/30 rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer summary */}
        {partyInventory.items.length > 0 && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50 shrink-0">
            <span className="text-[10px] text-gray-500">
              Total Weight: <span className="text-gray-300">{totalWeight.toFixed(1)} lb</span>
            </span>
            <span className="text-[10px] text-gray-500">
              Total Value: <span className="text-yellow-400/80">{totalValue.toFixed(1)} GP</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
