import { useEffect, useState } from 'react'
import { addToast } from '../../../../hooks/use-toast'
import { load5eMonsters, searchMonsters } from '../../../../services/data-provider'
import type { Companion5e } from '../../../../types/companion'
import type { MonsterStatBlock } from '../../../../types/monster'
import { crToNumber } from '../../../../types/monster'
import { logger } from '../../../../utils/logger'
import { MonsterStatBlockView } from '../../dm'

type CreatureTab = 'browse' | 'summon'

interface CreatureModalProps {
  onClose: () => void
  onPlace?: (monster: MonsterStatBlock) => void
  onSummon?: (companion: Omit<Companion5e, 'id' | 'tokenId' | 'createdAt'>) => void
  isDM?: boolean
  characterId?: string
  spellName?: string
  initialTab?: CreatureTab
}

const SIZE_OPTIONS = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const
const TYPE_OPTIONS = [
  'Beast',
  'Fiend',
  'Undead',
  'Aberration',
  'Celestial',
  'Fey',
  'Dragon',
  'Humanoid',
  'Monstrosity',
  'Construct',
  'Elemental',
  'Ooze',
  'Plant',
  'Giant'
] as const
const CR_OPTIONS = [
  { label: 'CR 0', max: 0 },
  { label: 'CR 1/8-1/4', max: 0.25 },
  { label: 'CR 1/2-1', max: 1 },
  { label: 'CR 2-4', max: 4 },
  { label: 'CR 5-10', max: 10 },
  { label: 'CR 11+', max: 30 }
] as const

export default function CreatureModal({
  onClose,
  onPlace,
  onSummon,
  isDM,
  characterId,
  spellName,
  initialTab = 'browse'
}: CreatureModalProps): JSX.Element {
  const [tab, setTab] = useState<CreatureTab>(initialTab)
  const [monsters, setMonsters] = useState<MonsterStatBlock[]>([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [sizeFilter, setSizeFilter] = useState<string | null>(null)
  const [crFilter, setCrFilter] = useState<{ max: number } | null>(null)
  const [selected, setSelected] = useState<MonsterStatBlock | null>(null)

  // Summon-specific state
  const [customName, setCustomName] = useState('')
  const [customHP, setCustomHP] = useState('')
  const [concentration, setConcentration] = useState(true)

  useEffect(() => {
    load5eMonsters()
      .then(setMonsters)
      .catch((err) => {
        logger.error('Failed to load monsters', err)
        addToast('Failed to load creatures', 'error')
        setMonsters([])
      })
  }, [])

  const filtered = (() => {
    let result = searchMonsters(monsters, query)
    if (typeFilter) result = result.filter((m) => m.type === typeFilter)
    if (sizeFilter) result = result.filter((m) => m.size === sizeFilter)
    if (crFilter) {
      const prevMax = CR_OPTIONS[CR_OPTIONS.indexOf(CR_OPTIONS.find((c) => c.max === crFilter.max)!) - 1]?.max ?? -1
      result = result.filter((m) => {
        const cr = crToNumber(m.cr)
        return cr > prevMax && cr <= crFilter.max
      })
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  })()

  const handleSummon = (): void => {
    if (!selected || !onSummon || !characterId) return
    const hp = customHP ? parseInt(customHP, 10) : selected.hp
    const finalHP = Number.isNaN(hp) || hp <= 0 ? selected.hp : hp
    onSummon({
      type: 'summoned',
      name: customName.trim() || selected.name,
      monsterStatBlockId: selected.id,
      currentHP: finalHP,
      maxHP: finalHP,
      ownerId: characterId,
      dismissed: false,
      sourceSpell: spellName || 'summon',
      ...(concentration ? { concentrationCasterId: characterId } : {})
    })
    onClose()
  }

  const handlePlaceOnMap = (): void => {
    if (!selected || !onPlace) return
    onPlace(selected)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-[900px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with tabs */}
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setTab('browse')}
              className={`text-sm font-bold transition-colors cursor-pointer pb-0.5 ${
                tab === 'browse' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Browse
            </button>
            <button
              onClick={() => setTab('summon')}
              className={`text-sm font-bold transition-colors cursor-pointer pb-0.5 ${
                tab === 'summon' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Summon
            </button>
            {tab === 'summon' && spellName && <span className="text-xs text-gray-500">via {spellName}</span>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl cursor-pointer">
            x
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-4 py-2 border-b border-gray-700/50 space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creatures..."
            className={`w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none ${
              tab === 'browse' ? 'focus:border-amber-500' : 'focus:border-purple-500'
            }`}
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={typeFilter ?? ''}
              onChange={(e) => setTypeFilter(e.target.value || null)}
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 cursor-pointer"
            >
              <option value="">All Types</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={sizeFilter ?? ''}
              onChange={(e) => setSizeFilter(e.target.value || null)}
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 cursor-pointer"
            >
              <option value="">All Sizes</option>
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={crFilter?.max?.toString() ?? ''}
              onChange={(e) => {
                const val = e.target.value
                setCrFilter(val ? { max: parseFloat(val) } : null)
              }}
              className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 cursor-pointer"
            >
              <option value="">All CRs</option>
              {CR_OPTIONS.map((c) => (
                <option key={c.label} value={c.max}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-gray-500 self-center ml-auto">
              {filtered.length} creature{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Summon-specific options */}
          {tab === 'summon' && (
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Custom name (optional)"
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <input
                type="number"
                value={customHP}
                onChange={(e) => setCustomHP(e.target.value)}
                placeholder={selected ? `HP (${selected.hp})` : 'Custom HP'}
                min={1}
                className="w-24 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={concentration}
                  onChange={(e) => setConcentration(e.target.checked)}
                  className="rounded"
                />
                Concentration
              </label>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* List */}
          <div className="w-64 overflow-y-auto border-r border-gray-700/50">
            {filtered.slice(0, 200).map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={`w-full px-3 py-2 text-left cursor-pointer transition-colors ${
                  selected?.id === m.id
                    ? tab === 'browse'
                      ? 'bg-amber-600/20 border-l-2 border-amber-500'
                      : 'bg-purple-600/20 border-l-2 border-purple-500'
                    : 'hover:bg-gray-800 border-l-2 border-transparent'
                }`}
              >
                <div className="text-sm text-gray-200 font-medium">{m.name}</div>
                <div className="text-[10px] text-gray-500">
                  {m.size} {m.type} - CR {m.cr}
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-gray-500 text-xs text-center p-4">No creatures found</div>}
            {filtered.length > 200 && (
              <div className="text-gray-600 text-[10px] text-center p-2">Showing first 200 of {filtered.length}</div>
            )}
          </div>

          {/* Detail */}
          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <div className="space-y-3">
                <MonsterStatBlockView monster={selected} />
                {tab === 'browse' && isDM && onPlace && (
                  <button
                    onClick={handlePlaceOnMap}
                    className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Place on Map
                  </button>
                )}
                {tab === 'summon' && onSummon && characterId && (
                  <button
                    onClick={handleSummon}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Summon {customName.trim() || selected.name}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm text-center mt-20">Select a creature to view its stat block</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
