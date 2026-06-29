import { useEffect, useRef, useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { useT } from '../../../i18n'
import { getEffectiveArmor, getEffectiveClasses } from '../../../services/character/effective-character-5e'
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
  const { t } = useT()
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
  // Phase 22b — track the auto-dismiss timers so they're cleared on unmount
  // (otherwise setState fires on an unmounted component).
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const costErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      if (costErrorTimerRef.current) clearTimeout(costErrorTimerRef.current)
    },
    []
  )

  const armorDatabase = useArmorDatabase()

  // Phase 15c.5 — derive armor + classes (v3 shape) from v4 refs via the truth store.
  const armor: ArmorEntry[] = getEffectiveArmor(character)
  const classes = getEffectiveClasses(character)
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
          t('sheet.armorManager.notEnoughFunds', {
            amount: cost.amount,
            currency: cost.currency.toUpperCase(),
            costCp,
            totalCp
          })
        )
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
        warningTimerRef.current = setTimeout(() => setBuyWarning(null), 4000)
        return
      }
      newCurrency = result
    }

    const newArmor = armorDataToEntry(armorItem)
    const currentArmor: ArmorEntry[] = getEffectiveArmor(latest)
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
    const currentArmor: ArmorEntry[] = getEffectiveArmor(latest)
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
    const currentArmor: ArmorEntry[] = getEffectiveArmor(latest)
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
          setCustomCostError(t('sheet.armorManager.notEnoughFundsShort'))
          if (costErrorTimerRef.current) clearTimeout(costErrorTimerRef.current)
          costErrorTimerRef.current = setTimeout(() => setCustomCostError(null), 3000)
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

    const currentArmor: ArmorEntry[] = getEffectiveArmor(latest)
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
          <div className="text-xs text-gray-500 uppercase tracking-wide">{t('sheet.armorManager.armorClass')}</div>
          <div className="text-xl font-bold text-accent">{character.armorClass}</div>
        </div>

        {equippedArmor ? (
          <div className="bg-surface-2/50 rounded p-2 text-sm mb-2">
            <div className="flex justify-between">
              <span className="text-gray-300 font-medium">{equippedArmor.name}</span>
              <span className="text-muted">+{equippedArmor.acBonus} AC</span>
            </div>
            {equippedArmor.category && (
              <span className="text-xs text-gray-500 capitalize">
                {t('sheet.armorManager.categoryArmor', { category: equippedArmor.category })}
              </span>
            )}
            {equippedArmor.stealthDisadvantage && (
              <span className="text-xs text-yellow-500 ms-2">{t('sheet.armorManager.stealthDisadvantage')}</span>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mb-2">
            {(() => {
              const cNames = classes.map((c) => c.name.toLowerCase())
              if (cNames.includes('barbarian')) return t('sheet.armorManager.unarmoredDefenseCon')
              if (cNames.includes('monk') && !equippedShield) return t('sheet.armorManager.unarmoredDefenseWis')
              const isDracSorc = classes.some(
                (c) =>
                  c.name.toLowerCase() === 'sorcerer' &&
                  c.subclass?.toLowerCase().replace(/\s+/g, '-') === 'draconic-sorcery'
              )
              if (isDracSorc) return t('sheet.armorManager.draconicResilience')
              return t('sheet.armorManager.unarmored')
            })()}
          </div>
        )}

        {equippedShield && (
          <div className="bg-surface-2/50 rounded p-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300 font-medium">{equippedShield.name}</span>
              <span className="text-accent font-semibold">
                {t('sheet.armorManager.shieldAc', { bonus: equippedShield.acBonus })}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* All armor items with equip toggle */}
      {armor.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {t('sheet.armorManager.armorInventory')}
          </div>
          <div className="space-y-1">
            {armor.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-surface-2/50 rounded px-2 py-1 text-sm">
                <div className="flex items-center gap-2">
                  {!readonly && (
                    <button
                      onClick={() => toggleArmorEquipped(character.id, a.id)}
                      className={`w-4 h-4 rounded border cursor-pointer transition-colors ${
                        a.equipped ? 'bg-accent-strong border-accent' : 'border-gray-600 hover:border-gray-400'
                      }`}
                      title={a.equipped ? t('sheet.armorManager.unequip') : t('sheet.armorManager.equip')}
                    />
                  )}
                  <span className={a.equipped ? 'text-gray-200' : 'text-gray-500'}>{a.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{t('sheet.armorManager.acBonus', { bonus: a.acBonus })}</span>
                  <span className="capitalize">{a.type}</span>
                  {!readonly && (
                    <button
                      onClick={() => handleSellArmor(a.id)}
                      className="text-gray-600 hover:text-green-400 cursor-pointer"
                      title={t('sheet.armorManager.sellHalfPrice')}
                    >
                      &#x24;
                    </button>
                  )}
                  {!readonly && (
                    <button
                      onClick={() => handleRemoveArmor(a.id)}
                      className="text-gray-600 hover:text-red-400 cursor-pointer ms-1"
                      title={t('sheet.armorManager.removeArmor')}
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
            className="text-xs text-accent hover:text-amber-300 cursor-pointer"
          >
            {t('sheet.armorManager.addCustom')}
          </button>
          <button
            onClick={() => setShowAddArmor(true)}
            className="text-xs text-accent hover:text-amber-300 cursor-pointer"
          >
            {t('sheet.armorManager.addShop')}
          </button>
        </div>
      )}

      {/* SRD armor browser */}
      {!readonly && showAddArmor && (
        <div className="mb-3">
          <div className="bg-surface-2/50 rounded p-3 space-y-2">
            <div className="text-xs text-muted font-medium mb-1">{t('sheet.armorManager.armorShop')}</div>
            <select
              name="armor-select"
              value={selectedArmorIdx}
              onChange={(e) => {
                setSelectedArmorIdx(parseInt(e.target.value, 10))
                setBuyWarning(null)
              }}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-fg focus:outline-none focus:border-amber-500"
            >
              <option value={-1}>{t('sheet.armorManager.selectArmor')}</option>
              {armorDatabase.map((item, idx) => (
                <option key={idx} value={idx}>
                  {item.name} ({item.cost || t('sheet.armorManager.free')})
                </option>
              ))}
            </select>
            {selectedArmorIdx >= 0 && selectedArmorIdx < armorDatabase.length && (
              <div className="text-xs text-gray-500 bg-surface/50 rounded p-2">
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
                className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed rounded text-white cursor-pointer"
              >
                {t('sheet.armorManager.buy')}
              </button>
              <button
                onClick={() => {
                  setShowAddArmor(false)
                  setBuyWarning(null)
                  setSelectedArmorIdx(-1)
                }}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
              >
                {t('common.actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom armor form */}
      {!readonly && showCustomArmor && (
        <div className="mb-3">
          <div className="bg-surface-2/50 rounded p-3 space-y-2">
            <div className="text-xs text-muted font-medium mb-1">{t('sheet.armorManager.customArmor')}</div>
            <div className="flex gap-2">
              <input
                aria-label={t('sheet.armorManager.namePlaceholder')}
                type="text"
                name="armor-name"
                placeholder={t('sheet.armorManager.namePlaceholder')}
                value={customForm.name}
                onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
              <input
                aria-label={t('sheet.armorManager.acBonusPlaceholder')}
                type="number"
                name="armor-ac-bonus"
                placeholder={t('sheet.armorManager.acBonusPlaceholder')}
                value={customForm.acBonus}
                onChange={(e) => setCustomForm((f) => ({ ...f, acBonus: e.target.value }))}
                className="w-24 bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2">
              <select
                name="armor-type"
                value={customForm.type}
                onChange={(e) =>
                  setCustomForm((f) => ({ ...f, type: e.target.value as 'armor' | 'shield' | 'clothing' }))
                }
                className="bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
              >
                <option value="armor">{t('sheet.armorManager.typeArmor')}</option>
                <option value="shield">{t('sheet.armorManager.typeShield')}</option>
                <option value="clothing">{t('sheet.armorManager.typeClothing')}</option>
              </select>
              <input
                aria-label={t('sheet.armorManager.categoryPlaceholder')}
                type="text"
                name="armor-category"
                placeholder={t('sheet.armorManager.categoryPlaceholder')}
                value={customForm.category}
                onChange={(e) => setCustomForm((f) => ({ ...f, category: e.target.value }))}
                className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
              <input
                aria-label={t('sheet.armorManager.costPlaceholder')}
                type="text"
                name="armor-cost"
                placeholder={t('sheet.armorManager.costPlaceholder')}
                value={customForm.cost}
                onChange={(e) => {
                  setCustomForm((f) => ({ ...f, cost: e.target.value }))
                  setCustomCostError(null)
                }}
                className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-sm text-fg focus:outline-none focus:border-amber-500"
              />
            </div>
            {customCostError && <div className="text-xs text-red-400">{customCostError}</div>}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleAddCustomArmor}
                disabled={!customForm.name.trim()}
                className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed rounded text-white cursor-pointer"
              >
                {t('sheet.armorManager.add')}
              </button>
              <button
                onClick={() => {
                  setShowCustomArmor(false)
                  setCustomCostError(null)
                }}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
              >
                {t('common.actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
