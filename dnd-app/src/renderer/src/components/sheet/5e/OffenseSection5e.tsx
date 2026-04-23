import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { WeaponEntry } from '../../../types/character-common'
import { abilityModifier } from '../../../types/character-common'
import { addCurrency, computeSellPrice, deductWithConversion, parseCost, totalInCopper } from '../../../utils/currency'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'

import AttackCalculator5e from './AttackCalculator5e'
import { useWeaponDatabase, WeaponRow, weaponDataToEntry } from './WeaponList5e'

interface OffenseSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function OffenseSection5e({ character, readonly }: OffenseSection5eProps): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const newWeapons: WeaponEntry[] = character.weapons ?? []
  const weaponDatabase = useWeaponDatabase()

  const [showCustomForm, setShowCustomForm] = useState(false)
  const [showSrdBrowser, setShowSrdBrowser] = useState(false)
  const [selectedWeaponIdx, setSelectedWeaponIdx] = useState(-1)
  const [buyWarning, setBuyWarning] = useState<string | null>(null)
  const [costError, setCostError] = useState<string | null>(null)

  const [weaponForm, setWeaponForm] = useState({
    name: '',
    damage: '',
    damageType: '',
    properties: '',
    ability: 'STR' as 'STR' | 'DEX',
    proficient: true,
    cost: ''
  })

  const handleRemoveWeapon = (weaponId: string): void => {
    const latest = getLatest()
    if (!latest) return
    const currentWeapons: WeaponEntry[] =
      ('weapons' in latest ? (latest as { weapons: WeaponEntry[] }).weapons : []) ?? []
    const updated = {
      ...latest,
      weapons: currentWeapons.filter((w) => w.id !== weaponId),
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
  }

  const handleSellWeapon = (weaponId: string): void => {
    const latest = getLatest()
    if (!latest) return
    const currentWeapons: WeaponEntry[] =
      ('weapons' in latest ? (latest as { weapons: WeaponEntry[] }).weapons : []) ?? []
    const weapon = currentWeapons.find((w) => w.id === weaponId)
    if (!weapon) return

    let costStr = weapon.cost
    if (!costStr) {
      // Try to look up cost from database
      const dbWeapon = weaponDatabase.find((w) => w.name.toLowerCase() === weapon.name.toLowerCase())
      if (dbWeapon) costStr = dbWeapon.cost
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
      weapons: currentWeapons.filter((w) => w.id !== weaponId),
      treasure: updatedTreasure,
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
  }

  const handleAddCustomWeapon = (): void => {
    if (!weaponForm.name.trim()) return
    const latest = getLatest()
    if (!latest) return

    let updatedTreasure = latest.treasure
    const costStr = weaponForm.cost.trim()
    if (costStr) {
      const cost = parseCost(costStr)
      if (cost && cost.amount > 0) {
        const treasureForDeduction = {
          pp: latest.treasure.pp,
          gp: latest.treasure.gp,
          sp: latest.treasure.sp,
          cp: latest.treasure.cp
        }
        const newCurrency = deductWithConversion(treasureForDeduction, cost)
        if (!newCurrency) {
          setCostError('Not enough funds')
          setTimeout(() => setCostError(null), 3000)
          return
        }
        updatedTreasure = { ...latest.treasure, ...newCurrency }
      }
    }

    const abilityScore = weaponForm.ability === 'STR' ? latest.abilityScores.strength : latest.abilityScores.dexterity
    const mod = abilityModifier(abilityScore)
    const prof = Math.ceil(latest.level / 4) + 1
    const attackBonus = mod + (weaponForm.proficient ? prof : 0)

    const newWeapon: WeaponEntry = {
      id: crypto.randomUUID(),
      name: weaponForm.name.trim(),
      damage: weaponForm.damage.trim() || '1d6',
      damageType: weaponForm.damageType.trim() || 'slashing',
      attackBonus,
      properties: weaponForm.properties
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      proficient: weaponForm.proficient,
      cost: costStr || undefined
    }
    const currentWeapons: WeaponEntry[] =
      ('weapons' in latest ? (latest as { weapons: WeaponEntry[] }).weapons : []) ?? []
    const updated = {
      ...latest,
      weapons: [...currentWeapons, newWeapon],
      treasure: updatedTreasure,
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
    setCostError(null)
    setWeaponForm({ name: '', damage: '', damageType: '', properties: '', ability: 'STR', proficient: true, cost: '' })
    setShowCustomForm(false)
  }

  const handleBuySrdWeapon = (): void => {
    if (selectedWeaponIdx < 0 || selectedWeaponIdx >= weaponDatabase.length) return
    const weaponItem = weaponDatabase[selectedWeaponIdx]
    const cost = parseCost(weaponItem.cost)

    const latest = getLatest()
    if (!latest) return

    const treasure = latest.treasure
    const currentCurrency = { pp: treasure.pp, gp: treasure.gp, sp: treasure.sp, cp: treasure.cp }

    let newCurrency = currentCurrency
    if (cost && cost.amount > 0) {
      const result = deductWithConversion(currentCurrency, cost)
      if (!result) {
        const rates = { pp: 1000, gp: 100, sp: 10, cp: 1 } as const
        const totalCp = totalInCopper(currentCurrency)
        const costCp = cost.amount * rates[cost.currency]
        setBuyWarning(
          `Not enough funds (need ${cost.amount} ${cost.currency.toUpperCase()} = ${costCp} cp, have ${totalCp} cp total)`
        )
        setTimeout(() => setBuyWarning(null), 4000)
        return
      }
      newCurrency = result
    }

    const newWeapon = weaponDataToEntry(weaponItem, latest as Character5e)
    newWeapon.cost = weaponItem.cost
    const currentWeapons: WeaponEntry[] =
      ('weapons' in latest ? (latest as { weapons: WeaponEntry[] }).weapons : []) ?? []
    const updatedTreasure = {
      ...treasure,
      pp: newCurrency.pp,
      gp: newCurrency.gp,
      sp: newCurrency.sp,
      cp: newCurrency.cp
    }

    const updated = {
      ...latest,
      weapons: [...currentWeapons, newWeapon],
      treasure: updatedTreasure,
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
    setSelectedWeaponIdx(-1)
    setShowSrdBrowser(false)
    setBuyWarning(null)
  }

  return (
    <SheetSectionWrapper title="Offense">
      {/* Weapons */}
      {newWeapons.length > 0 ? (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Weapons</div>
          {newWeapons.map((w, i) => (
            <WeaponRow
              key={w.id || i}
              weapon={w}
              character={character}
              weaponDatabase={weaponDatabase}
              onRemove={!readonly && w.id ? () => handleRemoveWeapon(w.id) : undefined}
              onSell={!readonly && w.id ? () => handleSellWeapon(w.id) : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-3">No weapons equipped.</p>
      )}

      {/* Add Weapon buttons */}
      {!readonly && !showCustomForm && !showSrdBrowser && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setShowCustomForm(true)}
            className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            + Custom Weapon
          </button>
          <button
            onClick={() => setShowSrdBrowser(true)}
            className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            + Shop
          </button>
        </div>
      )}

      {/* Custom weapon form */}
      {!readonly && showCustomForm && (
        <div className="bg-gray-800/50 rounded p-3 space-y-2 mb-3">
          <div className="text-xs text-gray-400 font-medium mb-1">Custom Weapon</div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Name"
              value={weaponForm.name}
              onChange={(e) => setWeaponForm((f) => ({ ...f, name: e.target.value }))}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
            <input
              type="text"
              placeholder="Damage (1d8)"
              value={weaponForm.damage}
              onChange={(e) => setWeaponForm((f) => ({ ...f, damage: e.target.value }))}
              className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Damage type"
              value={weaponForm.damageType}
              onChange={(e) => setWeaponForm((f) => ({ ...f, damageType: e.target.value }))}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
            <input
              type="text"
              placeholder="Properties (comma-separated)"
              value={weaponForm.properties}
              onChange={(e) => setWeaponForm((f) => ({ ...f, properties: e.target.value }))}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Cost (e.g. 25 gp)"
              value={weaponForm.cost}
              onChange={(e) => {
                setWeaponForm((f) => ({ ...f, cost: e.target.value }))
                setCostError(null)
              }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          {costError && <div className="text-xs text-red-400">{costError}</div>}
          <div className="flex items-center gap-3">
            <select
              value={weaponForm.ability}
              onChange={(e) => setWeaponForm((f) => ({ ...f, ability: e.target.value as 'STR' | 'DEX' }))}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="STR">STR</option>
              <option value="DEX">DEX</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={weaponForm.proficient}
                onChange={(e) => setWeaponForm((f) => ({ ...f, proficient: e.target.checked }))}
                className="rounded"
              />
              Proficient
            </label>
            <div className="flex-1" />
            <button
              onClick={handleAddCustomWeapon}
              disabled={!weaponForm.name.trim()}
              className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white cursor-pointer"
            >
              Add
            </button>
            <button
              onClick={() => setShowCustomForm(false)}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SRD weapon browser */}
      {!readonly && showSrdBrowser && (
        <div className="bg-gray-800/50 rounded p-3 space-y-2 mb-3">
          <div className="text-xs text-gray-400 font-medium mb-1">Weapon Shop</div>
          <select
            value={selectedWeaponIdx}
            onChange={(e) => {
              setSelectedWeaponIdx(parseInt(e.target.value, 10))
              setBuyWarning(null)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          >
            <option value={-1}>-- Select weapon --</option>
            {weaponDatabase.map((item, idx) => (
              <option key={idx} value={idx}>
                {item.name} — {item.damage} {item.damageType} ({item.cost || 'free'})
              </option>
            ))}
          </select>
          {selectedWeaponIdx >= 0 && selectedWeaponIdx < weaponDatabase.length && (
            <div className="text-xs text-gray-500 bg-gray-900/50 rounded p-2">
              {(() => {
                const w = weaponDatabase[selectedWeaponIdx]
                return `${w.damage} ${w.damageType} | ${w.category}${w.properties.length > 0 ? ` | ${w.properties.join(', ')}` : ''}`
              })()}
            </div>
          )}
          {buyWarning && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
              {buyWarning}
            </div>
          )}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleBuySrdWeapon}
              disabled={selectedWeaponIdx < 0}
              className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white cursor-pointer"
            >
              Buy
            </button>
            <button
              onClick={() => {
                setShowSrdBrowser(false)
                setBuyWarning(null)
                setSelectedWeaponIdx(-1)
              }}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <AttackCalculator5e character={character} readonly={readonly} weaponDatabase={weaponDatabase} />
    </SheetSectionWrapper>
  )
}
