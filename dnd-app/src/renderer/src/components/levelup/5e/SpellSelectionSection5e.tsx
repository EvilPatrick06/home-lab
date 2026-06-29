import { useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { getEffectiveClasses, getEffectiveKnownSpells } from '../../../services/character/effective-character-5e'
import {
  getCantripsKnown,
  getSlotProgression,
  hasAnySpellcasting,
  isThirdCaster,
  PREPARED_SPELLS
} from '../../../services/character/spell-data'
import { load5eSpells, load5eSubclasses } from '../../../services/data-provider'
import { useLevelUpStore } from '../../../stores/use-level-up-store'
import type { Character5e } from '../../../types/character-5e'

interface SpellSelectionSection5eProps {
  character: Character5e
  targetLevel: number
}

interface RawSpell {
  id: string
  // boundary-allow: Phase 15d sweep target — levelup component still consumes inline spell shape
  name: string
  level: number
  school?: string
  castingTime?: string
  castTime?: string
  range?: string
  duration?: string
  description: string
  concentration?: boolean
  ritual?: boolean
  components?: string
  classes?: string[]
}

export default function SpellSelectionSection5e({
  character,
  targetLevel
}: SpellSelectionSection5eProps): JSX.Element | null {
  const { t } = useT()
  const newSpellIds = useLevelUpStore((s) => s.newSpellIds)
  const toggleNewSpell = useLevelUpStore((s) => s.toggleNewSpell)
  const setSpellsRequired = useLevelUpStore((s) => s.setSpellsRequired)
  // Phase 24g — cantrip picker; Phase 24f — spell swap.
  const newCantripIds = useLevelUpStore((s) => s.newCantripIds)
  const toggleNewCantrip = useLevelUpStore((s) => s.toggleNewCantrip)
  const spellSwaps = useLevelUpStore((s) => s.spellSwaps)
  const addSpellSwap = useLevelUpStore((s) => s.addSpellSwap)
  const removeSpellSwap = useLevelUpStore((s) => s.removeSpellSwap)
  const [availableSpells, setAvailableSpells] = useState<RawSpell[]>([])
  const [availableCantrips, setAvailableCantrips] = useState<RawSpell[]>([])
  const [loading, setLoading] = useState(true)
  const [showAllSpells, setShowAllSpells] = useState(false)
  const [swapRemoveId, setSwapRemoveId] = useState('')

  const effectiveClasses = getEffectiveClasses(character)
  const effectiveKnownSpells = getEffectiveKnownSpells(character)
  const className = effectiveClasses[0]?.name?.toLowerCase() ?? ''
  const subclassId = effectiveClasses[0]?.subclass?.toLowerCase().replace(/\s+/g, '-') ?? ''

  // Check for third-caster subclasses (Eldritch Knight, Arcane Trickster)
  const isThirdCasterClass = isThirdCaster(className, subclassId)

  // Always-prepared spell names that don't count against the limit (e.g. Druid's Speak with Animals, Ranger's Hunter's Mark, subclass spells)
  const alwaysPreparedNames = new Set<string>()
  if (className === 'druid') alwaysPreparedNames.add('speak with animals')
  if (className === 'ranger') alwaysPreparedNames.add("hunter's mark")

  // Load subclass always-prepared spell names
  const [subclassNewSpells, setSubclassNewSpells] = useState<string[]>([])
  useEffect(() => {
    if (!subclassId) {
      setSubclassNewSpells([])
      return
    }
    load5eSubclasses()
      .then((subclasses) => {
        const sc = subclasses.find((s) => s.id === subclassId)
        if (!sc?.alwaysPreparedSpells) {
          setSubclassNewSpells([])
          return
        }
        const names: string[] = []
        for (const [lvlStr, spellNames] of Object.entries(sc.alwaysPreparedSpells)) {
          if (targetLevel >= Number(lvlStr)) {
            for (const n of spellNames) alwaysPreparedNames.add(n.toLowerCase())
            names.push(...spellNames)
          }
        }
        setSubclassNewSpells(names)
      })
      .catch(() => setSubclassNewSpells([]))
  }, [subclassId, targetLevel, alwaysPreparedNames.add])

  // Add currently loaded subclass spells to always-prepared names
  for (const n of subclassNewSpells) alwaysPreparedNames.add(n.toLowerCase())

  // Calculate how many new spells this character can pick (exclude always-prepared)
  const existingCount = effectiveKnownSpells.filter(
    (s) => s.level > 0 && !s.id.startsWith('species-') && !alwaysPreparedNames.has(s.name.toLowerCase())
  ).length
  const preparedTable = PREPARED_SPELLS[className]
  const newMax = preparedTable ? (preparedTable[targetLevel] ?? 0) : 0
  const canPick = preparedTable ? Math.max(0, newMax - existingCount) : -1 // -1 = non-caster or third-caster, unlimited picks

  // Report spellsRequired to the store for validation
  useEffect(() => {
    setSpellsRequired(canPick >= 0 ? canPick : 0)
  }, [canPick, setSpellsRequired])

  // Calculate max spell level accessible
  let maxSpellLevel = 0
  const classLevel = effectiveClasses[0]?.level ?? character.level
  const newClassLevel = classLevel + (targetLevel - character.level)
  if (isThirdCasterClass) {
    // Third-casters use full caster slots at floor(classLevel/3)
    const effectiveLevel = Math.floor(newClassLevel / 3)
    const thirdCasterSlots = effectiveLevel >= 1 ? getSlotProgression('wizard', effectiveLevel) : {}
    for (const lvlStr of Object.keys(thirdCasterSlots)) {
      const lvl = Number(lvlStr)
      if (lvl > maxSpellLevel) maxSpellLevel = lvl
    }
  } else {
    const slots = getSlotProgression(className, targetLevel)
    for (const lvlStr of Object.keys(slots)) {
      const lvl = Number(lvlStr)
      if (lvl > maxSpellLevel) maxSpellLevel = lvl
    }
  }

  // If not a caster, return null
  const isCaster = hasAnySpellcasting(className) || isThirdCasterClass

  const spellListClass = isThirdCasterClass ? 'wizard' : className

  // Phase 24g — number of cantrips gained between current and target level.
  const cantripsToLearn = Math.max(
    0,
    getCantripsKnown(className, targetLevel) - getCantripsKnown(className, character.level)
  )

  // Phase 24f — known spells eligible for replacement: leveled spells that are
  // not species/feat/class/subclass-granted (those are always-prepared).
  const swappableSpells = effectiveKnownSpells.filter(
    (s) =>
      s.level > 0 &&
      !s.id.startsWith('species-') &&
      s.source !== 'species' &&
      s.source !== 'feat' &&
      s.source !== 'class' &&
      !alwaysPreparedNames.has(s.name.toLowerCase())
  )
  const maxSwaps = Math.max(0, targetLevel - character.level)

  // biome-ignore lint/correctness/useExhaustiveDependencies: Effect loads spells and uses effectiveKnownSpells.map(s=>s.id) only to build existingIds for filtering. effectiveKnownSpells is a fresh hydrated array every render (derived from character.knownSpellRe
  useEffect(() => {
    if (!isCaster || maxSpellLevel === 0) {
      setLoading(false)
      return
    }
    load5eSpells()
      .then((spells) => {
        const existingIds = new Set(effectiveKnownSpells.map((s) => s.id))
        const filtered = spells.filter((s) => {
          if (s.level === 0 || s.level > maxSpellLevel) return false
          if (existingIds.has(s.id)) return false
          if (!showAllSpells && s.classes && !s.classes.some((c) => c.toLowerCase() === spellListClass)) return false
          return true
        })
        // Sort on-list before off-list when showing all
        if (showAllSpells) {
          filtered.sort((a, b) => {
            const aOnList = a.classes?.some((c) => c.toLowerCase() === spellListClass) ? 0 : 1
            const bOnList = b.classes?.some((c) => c.toLowerCase() === spellListClass) ? 0 : 1
            if (aOnList !== bOnList) return aOnList - bOnList
            return a.level - b.level || a.name.localeCompare(b.name)
          })
        } else {
          filtered.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
        }
        setAvailableSpells(filtered)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [isCaster, maxSpellLevel, character.knownSpellRefs, showAllSpells, spellListClass])

  // Phase 24g — load class cantrip list when the character gains cantrips.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mirrors the spell-load effect's deps
  useEffect(() => {
    if (!isCaster || cantripsToLearn <= 0) {
      setAvailableCantrips([])
      return
    }
    load5eSpells()
      .then((spells) => {
        const existingIds = new Set(effectiveKnownSpells.map((s) => s.id))
        const cantrips = spells.filter(
          (s) =>
            s.level === 0 &&
            !existingIds.has(s.id) &&
            (showAllSpells || (s.classes?.some((c) => c.toLowerCase() === spellListClass) ?? false))
        )
        cantrips.sort((a, b) => a.name.localeCompare(b.name))
        setAvailableCantrips(cantrips)
      })
      .catch(() => setAvailableCantrips([]))
  }, [isCaster, cantripsToLearn, spellListClass, showAllSpells, character.knownSpellRefs])

  if (!isCaster || maxSpellLevel === 0) return null

  const atLimit = canPick >= 0 && newSpellIds.length >= canPick
  const isIncomplete = canPick > 0 && newSpellIds.length < canPick

  // Group by level
  const byLevel = new Map<number, RawSpell[]>()
  for (const spell of availableSpells) {
    const group = byLevel.get(spell.level) ?? []
    group.push(spell)
    byLevel.set(spell.level, group)
  }

  return (
    <div className={`bg-surface/50 border rounded-lg p-4 ${isIncomplete ? 'border-amber-600/50' : 'border-gray-800'}`}>
      <h3 className="text-sm font-semibold text-accent uppercase tracking-wide mb-3 flex items-center gap-2">
        {t('levelup.spellSelection.heading')}
        {isIncomplete && (
          <span className="text-xs text-accent-strong font-semibold">{t('levelup.spellSelection.required')}</span>
        )}
      </h3>
      {subclassNewSpells.length > 0 && (
        <div className="mb-3 bg-green-900/20 border border-green-800 rounded p-2">
          <div className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">
            {t('levelup.spellSelection.alwaysPrepared')}
          </div>
          <div className="text-xs text-muted">{subclassNewSpells.join(', ')}</div>
        </div>
      )}
      {canPick >= 0 && (
        <div className={`text-xs mb-2 ${isIncomplete ? 'text-accent' : 'text-gray-500'}`}>
          {t('levelup.spellSelection.selectCount', { count: canPick, selected: newSpellIds.length })}
        </div>
      )}
      {canPick < 0 && (
        <div className="text-xs text-gray-500 mb-2">
          {t('levelup.spellSelection.selectUnlimited', { selected: newSpellIds.length })}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-gray-500 mb-2 cursor-pointer select-none">
        <input
          type="checkbox"
          name="show-all-spells"
          checked={showAllSpells}
          onChange={(e) => setShowAllSpells(e.target.checked)}
          className="accent-amber-500"
        />
        {t('levelup.spellSelection.showAll')}
        {showAllSpells && <span className="text-orange-400">{t('levelup.spellSelection.offListMarked')}</span>}
      </label>

      {/* Phase 24g — cantrip picker */}
      {cantripsToLearn > 0 && (
        <div className="mb-3 border border-gray-800 rounded p-2">
          <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
            {t('levelup.spellSelection.newCantrips', { selected: newCantripIds.length, max: cantripsToLearn })}
            {newCantripIds.length < cantripsToLearn && (
              <span className="ms-2 text-accent-strong">{t('levelup.spellSelection.required')}</span>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {availableCantrips.map((c) => {
              const selected = newCantripIds.includes(c.id)
              const cantripAtLimit = newCantripIds.length >= cantripsToLearn
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    if (!selected && cantripAtLimit) return
                    toggleNewCantrip(c.id)
                  }}
                  disabled={!selected && cantripAtLimit}
                  className={`w-full text-start flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors ${
                    selected
                      ? 'bg-amber-600/20 border border-amber-600 text-amber-300'
                      : cantripAtLimit
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-gray-300 hover:bg-surface-2 border border-transparent'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border-2 flex-shrink-0 ${selected ? 'bg-accent-strong border-accent' : 'border-gray-600'}`}
                  />
                  <span>{c.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Phase 24f — replace a prepared spell (one per level gained) */}
      {maxSwaps > 0 && swappableSpells.length > 0 && (
        <div className="mb-3 border border-gray-800 rounded p-2">
          <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
            {t('levelup.spellSelection.replacePrepared', { selected: spellSwaps.length, max: maxSwaps })}
          </div>
          {spellSwaps.map((sw) => {
            const removed = effectiveKnownSpells.find((s) => s.id === sw.removeId)
            const added = availableSpells.find((s) => s.id === sw.addId)
            return (
              <div key={sw.removeId} className="flex items-center gap-2 text-xs text-gray-300 mb-1">
                <span className="text-red-400">−{removed?.name ?? sw.removeId}</span>
                <span>→</span>
                <span className="text-green-400">+{added?.name ?? sw.addId}</span>
                <button
                  onClick={() => removeSpellSwap(sw.removeId)}
                  className="ms-1 text-gray-500 hover:text-red-400 cursor-pointer"
                >
                  ×
                </button>
              </div>
            )
          })}
          {spellSwaps.length < maxSwaps && (
            <div className="flex flex-col gap-1 mt-1">
              <select
                name="spell-to-replace"
                value={swapRemoveId}
                onChange={(e) => setSwapRemoveId(e.target.value)}
                className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
              >
                <option value="">{t('levelup.spellSelection.spellToReplace')}</option>
                {swappableSpells
                  .filter((s) => !spellSwaps.some((sw) => sw.removeId === s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              {swapRemoveId && (
                <select
                  name="replacement-spell"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addSpellSwap({ removeId: swapRemoveId, addId: e.target.value })
                      setSwapRemoveId('')
                    }
                  }}
                  className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
                >
                  <option value="">{t('levelup.spellSelection.replacementSpell')}</option>
                  {availableSpells
                    .filter((s) => s.level <= maxSpellLevel)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {t('levelup.spellSelection.spellWithLevel', { name: s.name, level: s.level })}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">{t('levelup.spellSelection.loading')}</div>
      ) : availableSpells.length === 0 ? (
        <div className="text-sm text-gray-500">{t('levelup.spellSelection.noNewSpells')}</div>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-3">
          {Array.from(byLevel.entries())
            .sort(([a], [b]) => a - b)
            .map(([level, spells]) => (
              <div key={level}>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                  {t('levelup.spellSelection.levelGroup', { levelOrdinal: `${level}${ordinal(level)}` })}
                </div>
                <div className="space-y-0.5">
                  {spells.map((spell) => {
                    const selected = newSpellIds.includes(spell.id)
                    return (
                      <button
                        key={spell.id}
                        onClick={() => {
                          if (!selected && atLimit) return
                          toggleNewSpell(spell.id)
                        }}
                        disabled={!selected && atLimit}
                        className={`w-full text-start flex items-center gap-2 px-2 py-1 rounded text-sm transition-colors ${
                          selected
                            ? 'bg-amber-600/20 border border-amber-600 text-amber-300'
                            : atLimit
                              ? 'text-gray-600 cursor-not-allowed'
                              : 'text-gray-300 hover:bg-surface-2 border border-transparent'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border-2 flex-shrink-0 ${
                            selected ? 'bg-accent-strong border-accent' : 'border-gray-600'
                          }`}
                        />
                        <span>{spell.name}</span>
                        {showAllSpells && !spell.classes?.some((c) => c.toLowerCase() === spellListClass) && (
                          <span className="text-xs text-orange-400 border border-orange-700 rounded px-1">
                            {t('levelup.spellSelection.offList')}
                          </span>
                        )}
                        {spell.concentration && (
                          <span className="text-xs text-yellow-500 border border-yellow-700 rounded px-1">
                            {t('levelup.spellSelection.concentration')}
                          </span>
                        )}
                        {spell.ritual && (
                          <span className="text-xs text-blue-400 border border-blue-700 rounded px-1">
                            {t('levelup.spellSelection.ritual')}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function ordinal(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}
