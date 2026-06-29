import { useEffect, useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { addToast } from '../../../../hooks/use-toast'
import { i18n, useT } from '../../../../i18n'
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
  { label: i18n.t('game.creatureModal.cr0'), max: 0 },
  { label: i18n.t('game.creatureModal.cr18_14'), max: 0.25 },
  { label: i18n.t('game.creatureModal.cr12_1'), max: 1 },
  { label: i18n.t('game.creatureModal.cr2_4'), max: 4 },
  { label: i18n.t('game.creatureModal.cr5_10'), max: 10 },
  { label: i18n.t('game.creatureModal.cr11plus'), max: 30 }
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
  const { t } = useT()
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

  useEscapeKey(onClose)

  // biome-ignore lint/correctness/useExhaustiveDependencies: Mount-once effect ([] deps) loads monsters; uses t only for an error toast. useT() returns a fresh t each render — adding it would convert a mount-once load into a per-render load.
  useEffect(() => {
    load5eMonsters()
      .then(setMonsters)
      .catch((err) => {
        logger.error('Failed to load monsters', err)
        addToast(t('game.creatureModal.loadFailed'), 'error')
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
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface border border-border rounded-xl w-[900px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with tabs */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setTab('browse')}
              className={`text-sm font-bold transition-colors cursor-pointer pb-0.5 ${
                tab === 'browse' ? 'text-accent border-b-2 border-accent' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t('game.creatureModal.browse')}
            </button>
            <button
              onClick={() => setTab('summon')}
              className={`text-sm font-bold transition-colors cursor-pointer pb-0.5 ${
                tab === 'summon' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t('game.creatureModal.summon')}
            </button>
            {tab === 'summon' && spellName && (
              <span className="text-xs text-gray-500">{t('game.creatureModal.viaSpell', { spell: spellName })}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl cursor-pointer">
            x
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-4 py-2 border-b border-border/50 space-y-2">
          <input
            name="creature-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('game.creatureModal.searchPlaceholder')}
            className={`w-full px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none ${
              tab === 'browse' ? 'focus:border-amber-500' : 'focus:border-purple-500'
            }`}
          />
          <div className="flex gap-2 flex-wrap">
            <select
              name="type-filter"
              value={typeFilter ?? ''}
              onChange={(e) => setTypeFilter(e.target.value || null)}
              className="px-2 py-1 bg-surface-2 border border-border rounded text-xs text-gray-300 cursor-pointer"
            >
              <option value="">{t('game.creatureModal.allTypes')}</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              name="size-filter"
              value={sizeFilter ?? ''}
              onChange={(e) => setSizeFilter(e.target.value || null)}
              className="px-2 py-1 bg-surface-2 border border-border rounded text-xs text-gray-300 cursor-pointer"
            >
              <option value="">{t('game.creatureModal.allSizes')}</option>
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              name="cr-filter"
              value={crFilter?.max?.toString() ?? ''}
              onChange={(e) => {
                const val = e.target.value
                setCrFilter(val ? { max: parseFloat(val) } : null)
              }}
              className="px-2 py-1 bg-surface-2 border border-border rounded text-xs text-gray-300 cursor-pointer"
            >
              <option value="">{t('game.creatureModal.allCrs')}</option>
              {CR_OPTIONS.map((c) => (
                <option key={c.label} value={c.max}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500 self-center ms-auto">
              {t('game.creatureModal.creatureCount', { count: filtered.length })}
            </span>
          </div>

          {/* Summon-specific options */}
          {tab === 'summon' && (
            <div className="flex items-center gap-3">
              <input
                name="custom-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t('game.creatureModal.customNamePlaceholder')}
                className="flex-1 px-2 py-1 bg-surface-2 border border-border rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <input
                name="custom-hp"
                type="number"
                value={customHP}
                onChange={(e) => setCustomHP(e.target.value)}
                placeholder={
                  selected
                    ? t('game.creatureModal.hpPlaceholder', { hp: selected.hp })
                    : t('game.creatureModal.customHpPlaceholder')
                }
                min={1}
                className="w-24 px-2 py-1 bg-surface-2 border border-border rounded text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer shrink-0">
                <input
                  name="concentration"
                  type="checkbox"
                  checked={concentration}
                  onChange={(e) => setConcentration(e.target.checked)}
                  className="rounded"
                />
                {t('game.creatureModal.concentration')}
              </label>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* List */}
          <div className="w-64 overflow-y-auto border-e border-border/50">
            {filtered.slice(0, 200).map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={`w-full px-3 py-2 text-start cursor-pointer transition-colors ${
                  selected?.id === m.id
                    ? tab === 'browse'
                      ? 'bg-amber-600/20 border-s-2 border-amber-500'
                      : 'bg-purple-600/20 border-s-2 border-purple-500'
                    : 'hover:bg-surface-2 border-s-2 border-transparent'
                }`}
              >
                <div className="text-sm text-gray-200 font-medium">{m.name}</div>
                <div className="text-xs text-gray-500">
                  {t('game.creatureModal.sizeTypeCr', { size: m.size, type: m.type, cr: m.cr })}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-gray-500 text-xs text-center p-4">{t('game.creatureModal.noCreaturesFound')}</div>
            )}
            {filtered.length > 200 && (
              <div className="text-gray-600 text-xs text-center p-2">
                {t('game.creatureModal.showingFirst', { count: filtered.length })}
              </div>
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
                    className="w-full px-4 py-2 bg-amber-600 hover:bg-accent-strong text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {t('game.creatureModal.placeOnMap')}
                  </button>
                )}
                {tab === 'summon' && onSummon && characterId && (
                  <button
                    onClick={handleSummon}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {t('game.creatureModal.summonNamed', { name: customName.trim() || selected.name })}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-sm text-center mt-20">{t('game.creatureModal.selectPrompt')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
