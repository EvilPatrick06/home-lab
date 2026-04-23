import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { useCharacterStore } from '../../../stores/use-character-store'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { ArmorEntry, Currency } from '../../../types/character-common'
import { addCurrency, computeSellPrice, deductWithConversion, parseCost, totalInCopper } from '../../../utils/currency'

import { type ArmorData5e, armorDataToEntry, getArmorDetail, useArmorDatabase } from './defense-utils'

type _ArmorData5e = ArmorData5e

interface ArmorManager5eProps {
  character: Character5e
  readonly?: boolean
}

export default function ArmorManager5e({ character, readonly }: ArmorManager5eProps): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const toggleArmorEquipped = useCharacterStore((s) => s.toggleArmorEquipped)
  const [showAddArmor, setShowAddArmor] = useState(false)
  const [showCustomArmor, setShowCustomArmor] = useState(false)
  const [selectedArmorIdx, setSelectedArmorIdx] = useState<number>(-1)
  const [buyWarning, setBuyWarning] = useState<string | null>(null)
  const [customForm, setCustomForm] = useState({
    name: '',
    acBonus: '',
    type: 'armor' as 'armor' | 'shield' | 'clothing',
    category: '',
    cost: ''
  })
  const [customCostError, setCustomCostError] = useState<string | null>(null)

  const armorDatabase = useArmorDatabase()

  const armor: ArmorEntry[] = character.armor ?? []
  const equippedArmor = armor.find((a) => a.equipped && a.type === 'armor')
  const equippedShield = armor.find((a) => a.equipped && a.type === 'shield')

  const handleBuyArmor = (): void => {
    if (selectedArmorIdx < 0 || selectedArmorIdx >= armorDatabase.length) return

    const armorItem = armorDatabase[selectedArmorIdx]
    const cost = parseCost(armorItem.cost)

    const latest = getLatest()
    if (!latest) return

    const treasure = latest.treasure as Currency
    const currentCurrency = { pp: treasure.pp, gp: treasure.gp, sp: treasure.sp, cp: treasure.cp }

    let newCurrency = currentCurrency
    if (cost && cost.amount > 0) {
      const result = deductWithConversion(currentCurrency, cost)
      if (!result) {
        const totalCp = totalInCopper(currentCurrency)
        const rates = { pp: 1000, gp: 100, sp: 10, cp: 1 } as const
        const costCp = cost.amount * rates[cost.currency]
        setBuyWarning(
          `Not enough funds (need ${cost.amount} ${cost.currency.toUpperCase()} = ${costCp} cp, have ${totalCp} cp total)`
        )
        setTimeout(() => setBuyWarning(null), 4000)
        return
      }
      newCurrency = result
    }

    const newArmor = armorDataToEntry(armorItem)
    const currentArmor: ArmorEntry[] = latest.armor ?? []
    const updatedTreasure = {
      ...treasure,
      pp: newCurrency.pp,
      gp: newCurrency.gp,
      sp: newCurrency.sp,
      cp: newCurrency.cp
    }

    const updated = {
      ...latest,
      armor: [...currentArmor, newArmor],
      treasure: updatedTreasure,
      updatedAt: new Date().toISOString()
    } as Character

    saveAndBroadcast(updated)
    setSelectedArmorIdx(-1)
    setShowAddArmor(false)
    setBuyWarning(null)
  }

  const handleRemoveArmor = (armorId: string): void => {
    const latest = getLatest()
    if (!latest) return
    const currentArmor: ArmorEntry[] = latest.armor ?? []
    const updated = {
      ...latest,
      armor: currentArmor.filter((a) => a.id !== armorId),
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
  }

  const handleSellArmor = (armorId: string): void => {
    const latest = getLatest()
    if (!latest) return
    const currentArmor: ArmorEntry[] = latest.armor ?? []
    const armorItem = currentArmor.find((a) => a.id === armorId)
    if (!armorItem) return

    let costStr = armorItem.cost
    if (!costStr) {
      const dbArmor = armorDatabase.find((a) => a.name.toLowerCase() === armorItem.name.toLowerCase())
      if (dbArmor) costStr = dbArmor.cost
    }

    let updatedTreasure = latest.treasure
    if (costStr) {
      const sellPrice = computeSellPrice(costStr)
      if (sellPrice) {
        const currentCurrency = {
          pp: latest.treasure.pp,
          gp: latest.treasure.gp,
          sp: latest.treasure.sp,
          cp: latest.treasure.cp
        }
        updatedTreasure = { ...latest.treasure, ...addCurrency(currentCurrency, sellPrice) }
      }
    }

    const updated = {
      ...latest,
      armor: currentArmor.filter((a) => a.id !== armorId),
      treasure: updatedTreasure,
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
  }

  const handleAddCustomArmor = (): void => {
    if (!customForm.name.trim()) return
    const latest = getLatest()
    if (!latest) return

    let updatedTreasure = latest.treasure
    const costStr = customForm.cost.trim()
    if (costStr) {
      const cost = parseCost(costStr)
      if (cost && cost.amount > 0) {
        const currentCurrency = {
          pp: latest.treasure.pp,
          gp: latest.treasure.gp,
          sp: latest.treasure.sp,
          cp: latest.treasure.cp
        }
        const newCurrency = deductWithConversion(currentCurrency, cost)
        if (!newCurrency) {
          setCustomCostError('Not enough funds')
          setTimeout(() => setCustomCostError(null), 3000)
          return
        }
        updatedTreasure = { ...latest.treasure, ...newCurrency }
      }
    }

    const newArmor: ArmorEntry = {
      id: crypto.randomUUID(),
      name: customForm.name.trim(),
      acBonus: parseInt(customForm.acBonus, 10) || 0,
      equipped: false,
      type: customForm.type,
      category: customForm.category.trim() || undefined,
      cost: customForm.cost.trim() || undefined
    }

    const currentArmor: ArmorEntry[] = latest.armor ?? []
    const updated = {
      ...latest,
      armor: [...currentArmor, newArmor],
      treasure: updatedTreasure,
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
    setCustomForm({ name: '', acBonus: '', type: 'armor', category: '', cost: '' })
    setCustomCostError(null)
    setShowCustomArmor(false)
  }

  return (
    <>
      {/* AC Breakdown */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Armor Class</div>
          <div className="text-xl font-bold text-amber-400">{character.armorClass}</div>
        </div>

        {equippedArmor ? (
          <div className="bg-gray-800/50 rounded p-2 text-sm mb-2">
            <div className="flex justify-between">
              <span className="text-gray-300 font-medium">{equippedArmor.name}</span>
              <span className="text-gray-400">+{equippedArmor.acBonus} AC</span>
            </div>
            {equippedArmor.category && (
              <span className="text-xs text-gray-500 capitalize">{equippedArmor.category} armor</span>
            )}
            {equippedArmor.stealthDisadvantage && (
              <span className="text-xs text-yellow-500 ml-2">Stealth disadvantage</span>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mb-2">
            {(() => {
              const cNames = character.classes.map((c) => c.name.toLowerCase())
              if (cNames.includes('barbarian')) return 'Unarmored Defense (10 + DEX + CON)'
              if (cNames.includes('monk') && !equippedShield) return 'Unarmored Defense (10 + DEX + WIS)'
              const isDracSorc = character.classes.some(
                (c) =>
                  c.name.toLowerCase() === 'sorcerer' &&
                  c.subclass?.toLowerCase().replace(/\s+/g, '-') === 'draconic-sorcery'
              )
              if (isDracSorc) return 'Draconic Resilience (10 + DEX + CHA)'
              return 'Unarmored (10 + DEX)'
            })()}
          </div>
        )}

        {equippedShield && (
          <div className="bg-gray-800/50 rounded p-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300 font-medium">{equippedShield.name}</span>
              <span className="text-amber-400 font-semibold">Shield: +{equippedShield.acBonus} AC</span>
            </div>
          </div>
        )}
      </div>

      {/* All armor items with equip toggle */}
      {armor.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Armor Inventory</div>
          <div className="space-y-1">
            {armor.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1 text-sm">
                <div className="flex items-center gap-2">
                  {!readonly && (
                    <button
                      onClick={() => toggleArmorEquipped(character.id, a.id)}
                      className={`w-4 h-4 rounded border cursor-pointer transition-colors ${
                        a.equipped ? 'bg-amber-500 border-amber-400' : 'border-gray-600 hover:border-gray-400'
                      }`}
                      title={a.equipped ? 'Unequip' : 'Equip'}
                    />
                  )}
                  <span className={a.equipped ? 'text-gray-200' : 'text-gray-500'}>{a.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>+{a.acBonus} AC</span>
                  <span className="capitalize">{a.type}</span>
                  {!readonly && (
                    <button
                      onClick={() => handleSellArmor(a.id)}
                      className="text-gray-600 hover:text-green-400 cursor-pointer"
                      title="Sell (half price)"
                    >
                      &#x24;
                    </button>
                  )}
                  {!readonly && (
                    <button
                      onClick={() => handleRemoveArmor(a.id)}
                      className="text-gray-600 hover:text-red-400 cursor-pointer ml-1"
                      title="Remove armor"
                    >
                      &#x2715;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Armor */}
      {!readonly && !showAddArmor && !showCustomArmor && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setShowCustomArmor(true)}
            className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            + Custom
          </button>
          <button
            onClick={() => setShowAddArmor(true)}
            className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            + Shop
          </button>
        </div>
      )}

      {/* SRD armor browser */}
      {!readonly && showAddArmor && (
        <div className="mb-3">
          <div className="bg-gray-800/50 rounded p-3 space-y-2">
            <div className="text-xs text-gray-400 font-medium mb-1">Armor Shop</div>
            <select
              value={selectedArmorIdx}
              onChange={(e) => {
                setSelectedArmorIdx(parseInt(e.target.value, 10))
                setBuyWarning(null)
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value={-1}>-- Select armor --</option>
              {armorDatabase.map((item, idx) => (
                <option key={idx} value={idx}>
                  {item.name} ({item.cost || 'free'})
                </option>
              ))}
            </select>
            {selectedArmorIdx >= 0 && selectedArmorIdx < armorDatabase.length && (
              <div className="text-xs text-gray-500 bg-gray-900/50 rounded p-2">
                {getArmorDetail(armorDatabase[selectedArmorIdx])}
              </div>
            )}
            {buyWarning && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
                {buyWarning}
              </div>
            )}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleBuyArmor}
                disabled={selectedArmorIdx < 0}
                className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white cursor-pointer"
              >
                Buy
              </button>
              <button
                onClick={() => {
                  setShowAddArmor(false)
                  setBuyWarning(null)
                  setSelectedArmorIdx(-1)
                }}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom armor form */}
      {!readonly && showCustomArmor && (
        <div className="mb-3">
          <div className="bg-gray-800/50 rounded p-3 space-y-2">
            <div className="text-xs text-gray-400 font-medium mb-1">Custom Armor</div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name"
                value={customForm.name}
                onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              />
              <input
                type="number"
                placeholder="AC Bonus"
                value={customForm.acBonus}
                onChange={(e) => setCustomForm((f) => ({ ...f, acBonus: e.target.value }))}
                className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={customForm.type}
                onChange={(e) =>
                  setCustomForm((f) => ({ ...f, type: e.target.value as 'armor' | 'shield' | 'clothing' }))
                }
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              >
                <option value="armor">Armor</option>
                <option value="shield">Shield</option>
                <option value="clothing">Clothing/Wearable</option>
              </select>
              <input
                type="text"
                placeholder="Category (e.g. heavy)"
                value={customForm.category}
                onChange={(e) => setCustomForm((f) => ({ ...f, category: e.target.value }))}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              />
              <input
                type="text"
                placeholder="Cost (e.g. 50 gp)"
                value={customForm.cost}
                onChange={(e) => {
                  setCustomForm((f) => ({ ...f, cost: e.target.value }))
                  setCustomCostError(null)
                }}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            {customCostError && <div className="text-xs text-red-400">{customCostError}</div>}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleAddCustomArmor}
                disabled={!customForm.name.trim()}
                className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white cursor-pointer"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowCustomArmor(false)
                  setCustomCostError(null)
                }}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
