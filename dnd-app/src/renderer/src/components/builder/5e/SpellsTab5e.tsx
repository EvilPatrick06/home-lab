import { useCallback, useMemo, useState } from 'react'
import { useT } from '../../../i18n'
import { getSpellsFromTraits } from '../../../services/character/auto-populate-5e'
import {
  getCantripsKnown,
  getPreparedSpellMax,
  getSlotProgression,
  hasAnySpellcasting,
  isWarlockPactMagic
} from '../../../services/character/spell-data'
import { load5eSpells, load5eSubclasses } from '../../../services/data-provider'
import { useLibraryCategory } from '../../../services/library/use-library-entry'
import { useBuilderStore } from '../../../stores/use-builder-store'
import type { SubclassData } from '../../../types/data'
import SectionBanner from '../shared/SectionBanner'
import CantripPicker5e from './CantripPicker5e'
import SpellPicker5e from './SpellPicker5e'
import SpellSummary5e, { ordinal, type SpellData, SpellRow } from './SpellSummary5e'

export default function SpellsTab5e(): JSX.Element {
  const { t } = useT()
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const classSlot = buildSlots.find((s) => s.category === 'class')
  const speciesSlot = buildSlots.find((s) => s.category === 'ancestry')
  const targetLevel = useBuilderStore((s) => s.targetLevel)
  const speciesTraits = useBuilderStore((s) => s.speciesTraits)

  // Phase 15b Step 1 — spells + subclasses read live from the truth store.
  const allSpells = useLibraryCategory('spells', load5eSpells) as unknown as SpellData[]
  const allSubclasses = useLibraryCategory('subclasses', load5eSubclasses) as unknown as SubclassData[]
  const selectedSpellIds = useBuilderStore((s) => s.selectedSpellIds)
  const setSelectedSpellIds = useBuilderStore((s) => s.setSelectedSpellIds)
  const [warning, setWarning] = useState<string | null>(null)
  const [showAllSpells, setShowAllSpells] = useState(false)

  const subclassSlot = buildSlots.find((s) => s.id.includes('subclass'))
  const subclassId = subclassSlot?.selectedId ?? ''
  const fightingStyleSlot = buildSlots.find((s) => s.category === 'fighting-style')

  const classId = classSlot?.selectedId ?? ''
  const className = classSlot?.selectedName ?? ''
  const speciesName = speciesSlot?.selectedName ?? ''
  const isDruid = classId === 'druid'
  // S-14 — a Wizard's level-1 picks ARE the spellbook (known, not prepared); the
  // sheet shows them as Known/unprepared, so label the builder step accordingly.
  const usesSpellbook = classId === 'wizard'
  const isBlessedWarrior = fightingStyleSlot?.selectedId === 'fighting-style-blessed-warrior'
  const blessedWarriorCantrips = useBuilderStore((s) => s.blessedWarriorCantrips)
  const setBlessedWarriorCantrips = useBuilderStore((s) => s.setBlessedWarriorCantrips)

  // Subclass always-prepared spell names — derived from the live subclass list.
  const subclassAlwaysPreparedNames = useMemo(() => {
    if (!subclassId) return []
    const sc = allSubclasses.find((s) => (s.id ?? s.name.toLowerCase().replace(/\s+/g, '-')) === subclassId)
    if (!sc?.alwaysPreparedSpells) return []
    const names: string[] = []
    for (const [lvlStr, spellNames] of Object.entries(sc.alwaysPreparedSpells)) {
      if (targetLevel >= Number(lvlStr)) names.push(...(spellNames as string[]))
    }
    return names
  }, [subclassId, targetLevel, allSubclasses])

  // Detect species spells from traits
  const speciesSpells = useMemo(() => {
    if (!speciesTraits.length) return []
    return getSpellsFromTraits(
      speciesTraits as Array<{
        name: string
        description: string
        spellGranted?: string | { list: string; count: number }
      }>,
      speciesName
    )
  }, [speciesTraits, speciesName])

  // Compute slot info
  const isCaster = hasAnySpellcasting(classId)
  const slotProgression = getSlotProgression(classId, targetLevel)
  const cantripsMax = getCantripsKnown(classId, targetLevel)
  const preparedMax = getPreparedSpellMax(classId, targetLevel)

  // Filter spells by class and max castable level
  const maxSpellLevel = useMemo(
    () =>
      Object.keys(slotProgression)
        .map(Number)
        .filter((lvl) => (slotProgression[lvl] ?? 0) > 0)
        .reduce((max, lvl) => Math.max(max, lvl), 0),
    [slotProgression]
  )

  // Build list of all class IDs for multiclass spell list union
  const allClassIds = useMemo(() => {
    const ids = new Set<string>()
    if (classId) ids.add(classId)
    // When classLevelChoices exists (multiclass), add those classes too
    const state = useBuilderStore.getState()
    if ('classLevelChoices' in state) {
      // boundary cast: store type has no index signature; reach optional classLevelChoices via Record
      const choices = (state as unknown as Record<string, unknown>).classLevelChoices as
        | Record<number, string>
        | undefined
      if (choices) {
        for (const cid of Object.values(choices)) {
          if (cid) ids.add(cid)
        }
      }
    }
    return [...ids]
  }, [classId])

  const isMulticlass = allClassIds.length > 1

  const availableSpells = useMemo(() => {
    let filtered = allSpells.filter((s) => s.level === 0 || s.level <= maxSpellLevel)
    if (!showAllSpells && allClassIds.length > 0) {
      filtered = filtered.filter((s) => allClassIds.some((cid) => s.classes?.includes(cid)))
    }
    // When showing all spells, sort on-list before off-list
    if (showAllSpells && allClassIds.length > 0) {
      filtered.sort((a, b) => {
        const aOnList = allClassIds.some((cid) => a.classes?.includes(cid)) ? 0 : 1
        const bOnList = allClassIds.some((cid) => b.classes?.includes(cid)) ? 0 : 1
        if (aOnList !== bOnList) return aOnList - bOnList
        return a.level - b.level || a.name.localeCompare(b.name)
      })
    } else {
      filtered.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    }
    return filtered
  }, [allSpells, allClassIds, maxSpellLevel, showAllSpells])

  // Compute off-list spell IDs
  const offListSpellIds = useMemo(() => {
    if (!showAllSpells || allClassIds.length === 0) return new Set<string>()
    const ids = new Set<string>()
    for (const spell of availableSpells) {
      if (!allClassIds.some((cid) => spell.classes?.includes(cid))) {
        ids.add(spell.id)
      }
    }
    return ids
  }, [showAllSpells, allClassIds, availableSpells])

  // Always-prepared spell IDs
  const isRanger = classId === 'ranger'
  const alwaysPreparedIds = useMemo(() => {
    const ids = new Set<string>()
    if (isDruid) {
      const spa = allSpells.find((s) => s.name === 'Speak with Animals')
      if (spa) ids.add(spa.id)
    }
    if (isRanger) {
      const hm = allSpells.find((s) => s.name === "Hunter's Mark")
      if (hm) ids.add(hm.id)
    }
    for (const name of subclassAlwaysPreparedNames) {
      const spell = allSpells.find((s) => s.name.toLowerCase() === name.toLowerCase())
      if (spell) ids.add(spell.id)
    }
    return ids
  }, [isDruid, isRanger, allSpells, subclassAlwaysPreparedNames])

  // Count selected cantrips and leveled spells (exclude always-prepared)
  const selectedCantripsCount = useMemo(
    () =>
      selectedSpellIds.filter((id) => !alwaysPreparedIds.has(id) && allSpells.find((s) => s.id === id)?.level === 0)
        .length,
    [selectedSpellIds, allSpells, alwaysPreparedIds]
  )

  const selectedLeveledCount = useMemo(
    () =>
      selectedSpellIds.filter((id) => {
        if (alwaysPreparedIds.has(id)) return false
        const spell = allSpells.find((s) => s.id === id)
        return spell && spell.level > 0
      }).length,
    [selectedSpellIds, allSpells, alwaysPreparedIds]
  )

  const toggleSpell = useCallback(
    (id: string): void => {
      if (alwaysPreparedIds.has(id)) return
      if (selectedSpellIds.includes(id)) {
        setSelectedSpellIds(selectedSpellIds.filter((s) => s !== id))
        setWarning(null)
      } else {
        const spell = allSpells.find((s) => s.id === id)
        if (!spell) return

        if (spell.level === 0 && cantripsMax > 0 && selectedCantripsCount >= cantripsMax) {
          setWarning(t('builder.spellsTab.cantripLimit', { max: cantripsMax }))
          return
        }

        if (spell.level > 0 && preparedMax !== null && selectedLeveledCount >= preparedMax) {
          setWarning(t('builder.spellsTab.preparedLimit', { max: preparedMax }))
          return
        }

        if (spell.level > 0) {
          const maxSpellLevel = Object.keys(slotProgression)
            .map(Number)
            .filter((lvl) => (slotProgression[lvl] ?? 0) > 0)
            .reduce((max, lvl) => Math.max(max, lvl), 0)
          if (spell.level > maxSpellLevel) {
            setWarning(
              t('builder.spellsTab.maxLevelWarning', {
                level: spell.level,
                maxLevel: maxSpellLevel || t('builder.spellsTab.none')
              })
            )
            return
          }
        }

        setWarning(null)
        setSelectedSpellIds([...selectedSpellIds, id])
      }
    },
    [
      selectedSpellIds,
      setSelectedSpellIds,
      allSpells,
      cantripsMax,
      selectedCantripsCount,
      preparedMax,
      selectedLeveledCount,
      slotProgression,
      alwaysPreparedIds,
      t
    ]
  )

  if (!classSlot?.selectedName) {
    return (
      <div>
        <SectionBanner label={t('builder.spellsTab.sectionTitle')} />
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-500 italic">{t('builder.spellsTab.selectClassFirst')}</p>
        </div>
      </div>
    )
  }

  // Non-caster with species spells
  if (!isCaster) {
    if (speciesSpells.length > 0) {
      return (
        <div>
          <SectionBanner label={t('builder.spellsTab.sectionTitle')} />
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-sm text-gray-500">{t('builder.spellsTab.nonCasterWithSpecies', { className })}</p>
          </div>
          <div className="px-4 py-2">
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              {t('builder.spellsTab.speciesSpellsHeader', { count: speciesSpells.length })}
            </div>
            {speciesSpells.map((spell) => (
              <SpellRow
                key={spell.id}
                spell={{
                  id: spell.id,
                  // boundary-allow: Phase 15b sweep target — builder spells tab still consumes inline spell shape
                  name: spell.name,
                  level: spell.level,
                  school: spell.school,
                  castingTime: spell.castingTime,
                  range: spell.range,
                  duration: spell.duration,
                  description: spell.description
                }}
                selected={true}
                onToggle={() => {}}
              />
            ))}
          </div>
        </div>
      )
    }

    return (
      <div>
        <SectionBanner label={t('builder.spellsTab.sectionTitle')} />
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-500">{t('builder.spellsTab.nonCaster', { className })}</p>
          <p className="text-xs text-gray-600 mt-1">{t('builder.spellsTab.nonCasterHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionBanner label={t('builder.spellsTab.sectionTitle')} />

      {/* Header with slot info */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-300">
            {isMulticlass ? (
              allClassIds.map((cid, i) => (
                <span key={cid}>
                  {i > 0 && ' / '}
                  <span className="text-amber-300 font-medium capitalize">{cid}</span>
                </span>
              ))
            ) : (
              <span className="text-amber-300 font-medium">{className}</span>
            )}{' '}
            {t('builder.spellsTab.spellList')}
          </p>
          <span className="text-xs text-gray-500">{t('builder.spellsTab.levelLabel', { level: targetLevel })}</span>
        </div>

        {Object.keys(slotProgression).length > 0 && (
          <div className="mb-2">
            {isWarlockPactMagic(classId) && (
              <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">
                {t('builder.spellsTab.pactMagicSlots')}
              </div>
            )}
            <div className="flex gap-2">
              {Object.entries(slotProgression).map(([lvl, count]) => (
                <div
                  key={lvl}
                  className={`rounded px-2 py-1 text-center ${isWarlockPactMagic(classId) ? 'bg-purple-900/30' : 'bg-surface-2'}`}
                >
                  <div className="text-xs text-gray-500">
                    {lvl}
                    {ordinal(Number(lvl))}
                  </div>
                  <div
                    className={`text-sm font-bold ${isWarlockPactMagic(classId) ? 'text-purple-400' : 'text-accent'}`}
                  >
                    {count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cantripsMax > 0 && (
          <div className="text-xs text-gray-500 mb-1">
            {t('builder.spellsTab.cantripsKnown')}{' '}
            <span className={selectedCantripsCount >= cantripsMax ? 'text-red-400' : 'text-accent'}>
              {selectedCantripsCount}
            </span>{' '}
            / {cantripsMax}
          </div>
        )}

        {preparedMax !== null && (
          <div className="text-xs text-gray-500 mb-1">
            {t(usesSpellbook ? 'builder.spellsTab.spellbookSpells' : 'builder.spellsTab.preparedSpells')}{' '}
            <span className={selectedLeveledCount >= preparedMax ? 'text-red-400' : 'text-accent'}>
              {selectedLeveledCount}
            </span>{' '}
            / {preparedMax}
          </div>
        )}

        {speciesSpells.length > 0 && (
          <div className="text-xs text-gray-500 mb-1">
            {t('builder.spellsTab.speciesSpellsLabel')}
            <span className="text-accent">{speciesSpells.length}</span>
            <span className="text-gray-600 ms-1">{t('builder.spellsTab.autoIncluded')}</span>
          </div>
        )}

        {alwaysPreparedIds.size > 0 && (
          <div className="text-xs text-gray-500 mb-1">
            {t('builder.spellsTab.alwaysPreparedLabel')}{' '}
            <span className="text-green-400">{alwaysPreparedIds.size}</span>
            <span className="text-gray-600 ms-1">{t('builder.spellsTab.fromClassFeatures')}</span>
          </div>
        )}

        {warning && <div className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1 mt-1">{warning}</div>}

        <label className="flex items-center gap-2 text-xs text-gray-500 mt-1 cursor-pointer select-none">
          <input
            type="checkbox"
            name="show-all-spells"
            checked={showAllSpells}
            onChange={(e) => setShowAllSpells(e.target.checked)}
            className="accent-amber-500"
          />
          {t('builder.spellsTab.showAllSpells')}
          {showAllSpells && <span className="text-orange-400">{t('builder.spellsTab.offListMarked')}</span>}
        </label>
      </div>

      {/* Blessed Warrior cantrip picker */}
      {isBlessedWarrior && (
        <div className="px-4 py-2 border-b border-gray-800">
          <CantripPicker5e
            allSpells={allSpells}
            selectedCantrips={blessedWarriorCantrips}
            onSelect={setBlessedWarriorCantrips}
          />
        </div>
      )}

      {/* Selected spells summary */}
      {selectedSpellIds.filter((id) => !alwaysPreparedIds.has(id)).length > 0 && (
        <SpellSummary5e
          selectedSpellIds={selectedSpellIds.filter((id) => !alwaysPreparedIds.has(id))}
          allSpells={allSpells}
          onRemove={(id) => setSelectedSpellIds(selectedSpellIds.filter((s) => s !== id))}
        />
      )}

      {/* Always-prepared spells */}
      {alwaysPreparedIds.size > 0 && (
        <div className="border-b border-gray-800">
          <div className="px-4 py-1 bg-surface/60">
            <span className="text-xs font-semibold text-green-400 uppercase">
              {t('builder.spellsTab.alwaysPreparedHeader')}
              <span className="text-gray-600 ms-1">
                {t('builder.spellsTab.count', { count: alwaysPreparedIds.size })}
              </span>
            </span>
          </div>
          {Array.from(alwaysPreparedIds).map((id) => {
            const spell = allSpells.find((s) => s.id === id)
            if (!spell) return null
            return (
              <SpellRow
                key={spell.id}
                spell={{
                  id: spell.id,
                  // boundary-allow: Phase 15b sweep target — builder spells tab still consumes inline spell shape
                  name: spell.name,
                  level: spell.level,
                  school: spell.school,
                  castingTime: spell.castingTime || spell.castTime,
                  range: spell.range,
                  duration: spell.duration,
                  description: spell.description
                }}
                selected={true}
                onToggle={() => {}}
              />
            )
          })}
        </div>
      )}

      {/* Species spells */}
      {speciesSpells.length > 0 && (
        <div className="border-b border-gray-800">
          <div className="px-4 py-1 bg-surface/60">
            <span className="text-xs font-semibold text-purple-400 uppercase">
              {t('builder.spellsTab.speciesSpellsHeaderPlain')}
              <span className="text-gray-600 ms-1">
                {t('builder.spellsTab.count', { count: speciesSpells.length })}
              </span>
            </span>
          </div>
          {speciesSpells.map((spell) => (
            <SpellRow
              key={spell.id}
              spell={{
                id: spell.id,
                // boundary-allow: Phase 15b sweep target — builder spells tab still consumes inline spell shape
                name: spell.name,
                level: spell.level,
                school: spell.school,
                castingTime: spell.castingTime,
                range: spell.range,
                duration: spell.duration,
                description: spell.description
              }}
              selected={true}
              onToggle={() => {}}
            />
          ))}
        </div>
      )}

      {/* Spell picker with search and filters */}
      <SpellPicker5e
        availableSpells={availableSpells}
        selectedSpellIds={selectedSpellIds}
        toggleSpell={toggleSpell}
        offListSpellIds={offListSpellIds}
      />
    </div>
  )
}
