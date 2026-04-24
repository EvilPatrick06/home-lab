import { useEffect, useRef, useState } from 'react'
import { useBuilderStore } from '../../../stores/use-builder-store'
import { deductWithConversion, parseCost, totalInCopper } from '../../../utils/currency'
import SectionBanner from '../shared/SectionBanner'
import EquipmentShop5e from './EquipmentShop5e'
import type { EquipmentDatabase } from './gear-tab-types'
import { CURRENCY_CONFIG, lookupItem, useEquipmentDatabase } from './gear-tab-types'
import HigherLevelEquipment5e from './HigherLevelEquipment5e'

function EditableCurrencyCircle({
  config,
  value,
  onChange
}: {
  config: (typeof CURRENCY_CONFIG)[number]
  value: number
  onChange: (val: number) => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit(): void {
    setDraft(String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commitEdit(): void {
    const parsed = parseInt(draft, 10)
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onChange(parsed)
    }
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      commitEdit()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-14 h-14 rounded-full border-2 ${config.ring} ${config.bg} ${config.text} flex flex-col items-center justify-center cursor-pointer transition-transform hover:scale-105`}
        onClick={() => !editing && startEdit()}
      >
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="w-10 h-6 text-center text-sm font-bold bg-transparent border-none outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
            style={{ color: 'inherit' }}
          />
        ) : (
          <span className="text-lg font-bold leading-tight">{value}</span>
        )}
      </div>
      <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">{config.fullName}</span>
    </div>
  )
}

function ItemDetailView({ item }: { item: ReturnType<typeof lookupItem> }): JSX.Element | null {
  if (!item) return <p className="text-xs text-gray-500 italic px-2 py-1">No mechanical data available.</p>

  if (item.type === 'weapon') {
    const w = item.data
    const weaponProps = w.properties ?? []
    const costStr = w.cost ?? ''
    const weightStr = w.weight !== undefined ? `${w.weight} lb.` : ''
    return (
      <div className="px-2 py-1.5 space-y-1 text-xs text-gray-400">
        <div className="flex gap-4">
          <span>
            <span className="text-gray-500">Damage:</span>{' '}
            <span className="text-red-400 font-medium">
              {w.damage} {w.damageType}
            </span>
          </span>
          <span>
            <span className="text-gray-500">Type:</span> {w.category}
          </span>
        </div>
        <div className="flex gap-4">
          {weightStr && (
            <span>
              <span className="text-gray-500">Weight:</span> {weightStr}
            </span>
          )}
          <span>
            <span className="text-gray-500">Cost:</span> {costStr}
          </span>
        </div>
        {weaponProps.length > 0 && (
          <div>
            <span className="text-gray-500">Properties:</span> {weaponProps.join(', ')}
          </div>
        )}
        {w.description && <div className="text-gray-500 mt-1">{w.description}</div>}
      </div>
    )
  }

  if (item.type === 'armor') {
    const a = item.data
    const acStr = a.dexBonus
      ? a.dexBonusMax !== null
        ? `${a.baseAC} + DEX (max ${a.dexBonusMax})`
        : `${a.baseAC} + DEX`
      : `${a.baseAC}`
    return (
      <div className="px-2 py-1.5 space-y-1 text-xs text-gray-400">
        <div className="flex gap-4">
          <span>
            <span className="text-gray-500">AC:</span> <span className="text-blue-400 font-medium">{acStr}</span>
          </span>
          <span>
            <span className="text-gray-500">Type:</span> {a.category}
          </span>
        </div>
        <div className="flex gap-4">
          <span>
            <span className="text-gray-500">Weight:</span> {a.weight} lb.
          </span>
          <span>
            <span className="text-gray-500">Cost:</span> {a.cost}
          </span>
        </div>
        {!!a.stealthDisadvantage && <div className="text-yellow-500">Stealth Disadvantage</div>}
        {!!a.strengthRequirement && (
          <div>
            <span className="text-gray-500">Str Required:</span> {String(a.strengthRequirement)}
          </div>
        )}
        {typeof a.description === 'string' && a.description && (
          <div className="text-gray-500 mt-1">{a.description}</div>
        )}
      </div>
    )
  }

  // Gear / fallback
  const g = item.data
  return (
    <div className="px-2 py-1.5 space-y-1 text-xs text-gray-400">
      <div>{g.description}</div>
      <div className="flex gap-4">
        {g.weight !== undefined && (
          <span>
            <span className="text-gray-500">Weight:</span> {g.weight} lb.
          </span>
        )}
        <span>
          <span className="text-gray-500">Cost:</span> {g.cost}
        </span>
      </div>
    </div>
  )
}

function InventoryItem({
  item,
  equipDb,
  onRemove
}: {
  item: { name: string; quantity: number }
  equipDb: EquipmentDatabase | null
  onRemove: () => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const looked = expanded ? lookupItem(equipDb, item.name) : null

  return (
    <div className="border-b border-gray-800/50 last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="flex items-center justify-between py-1.5 px-2 rounded text-sm text-gray-300 hover:bg-gray-800/60 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
          <span className="truncate">{item.name}</span>
          {item.quantity > 1 && <span className="text-xs text-gray-500 font-medium">x{item.quantity}</span>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="text-gray-600 hover:text-red-400 transition-colors ml-2 shrink-0 text-xs px-1"
          title="Remove item"
          aria-label="Remove item"
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div className="ml-5 mb-1 bg-gray-800/40 rounded">
          <ItemDetailView item={looked} />
        </div>
      )}
    </div>
  )
}

export default function GearTab5e(): JSX.Element {
  const classEquipment = useBuilderStore((s) => s.classEquipment)
  const bgEquipment = useBuilderStore((s) => s.bgEquipment)
  const currency = useBuilderStore((s) => s.currency)
  const setCurrency = useBuilderStore((s) => s.setCurrency)
  const removeEquipmentItem = useBuilderStore((s) => s.removeEquipmentItem)
  const addEquipmentItem = useBuilderStore((s) => s.addEquipmentItem)

  const _deductCurrency = useBuilderStore((s) => s.deductCurrency)
  const equipDb = useEquipmentDatabase()
  const [showShop, setShowShop] = useState(false)
  const [shopWarning, setShopWarning] = useState<string | null>(null)
  const shopWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (shopWarningTimerRef.current !== null) clearTimeout(shopWarningTimerRef.current)
    }
  }, [])

  // Flat combined inventory list
  const allItems = [
    ...classEquipment.map((item, idx) => ({ ...item, srcType: 'class' as const, srcIdx: idx })),
    ...bgEquipment.flatMap((group, gIdx) =>
      group.items.map((item) => ({
        name: item,
        quantity: 1,
        source: group.source,
        srcType: 'bg' as const,
        srcIdx: gIdx
      }))
    )
  ]

  const hasEquipment = allItems.length > 0

  function handleCurrencyChange(key: 'pp' | 'gp' | 'sp' | 'cp', val: number): void {
    setCurrency({ ...currency, [key]: val })
  }

  function handleAddFromShop(name: string, costStr: string): void {
    const cost = parseCost(costStr)
    if (cost && cost.amount > 0) {
      const newCurrency = deductWithConversion(currency, cost)
      if (!newCurrency) {
        const totalCp = totalInCopper(currency)
        const costCp = cost.amount * { pp: 1000, gp: 100, sp: 10, cp: 1 }[cost.currency]
        setShopWarning(
          `Not enough funds (need ${cost.amount} ${cost.currency.toUpperCase()} = ${costCp} cp, have ${totalCp} cp total)`
        )
        if (shopWarningTimerRef.current !== null) clearTimeout(shopWarningTimerRef.current)
        shopWarningTimerRef.current = setTimeout(() => setShopWarning(null), 3000)
        return
      }
      setCurrency(newCurrency)
    }
    addEquipmentItem({ name, quantity: 1, source: 'shop' })
    setShopWarning(null)
  }

  return (
    <div>
      {/* Currency */}
      <SectionBanner label="CURRENCY" />
      <div className="flex justify-center gap-4 px-4 py-4 border-b border-gray-800">
        {CURRENCY_CONFIG.map((c) => (
          <EditableCurrencyCircle
            key={c.key}
            config={c}
            value={currency[c.key]}
            onChange={(val) => handleCurrencyChange(c.key, val)}
          />
        ))}
      </div>

      {/* Higher Level Starting Equipment */}
      <HigherLevelEquipment5e />

      {/* Shop Button */}
      <div className="px-4 py-3 border-b border-gray-800">
        <button
          onClick={() => setShowShop(!showShop)}
          className="w-full text-sm text-gray-300 bg-gray-700/50 border border-gray-600/50 rounded-lg px-4 py-2 hover:bg-gray-700 transition-colors"
        >
          {showShop ? 'Hide Shop' : 'Shop'}
        </button>
      </div>

      {/* Equipment Shop Panel */}
      {showShop && equipDb && (
        <div className="px-4 py-3 border-b border-gray-800">
          {shopWarning && (
            <div className="mb-2 px-3 py-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded">
              {shopWarning}
            </div>
          )}
          <EquipmentShop5e equipDb={equipDb} onAdd={handleAddFromShop} onClose={() => setShowShop(false)} />
        </div>
      )}

      {/* Inventory */}
      <SectionBanner label="INVENTORY" />
      <div className="px-4 py-3">
        {hasEquipment ? (
          <div>
            {allItems.map((item) => (
              <InventoryItem
                key={`${item.srcType}-${item.srcIdx}-${item.name}`}
                item={item}
                equipDb={equipDb}
                onRemove={() => removeEquipmentItem(item.srcType, item.srcIdx)}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">Select a class and background to see starting equipment.</p>
        )}
      </div>
    </div>
  )
}
