import { useMemo, useState } from 'react'
import { SPELL_SCHOOLS } from '../../../constants'
import { useAsyncData } from '../../../hooks/use-async-data'
import { useT } from '../../../i18n'
import { CANTRIPS_KNOWN, getWarlockMaxSpellLevel } from '../../../services/character/spell-preparation-analyzer'
import { load5eSpells } from '../../../services/data-provider'
import { playSpellSound } from '../../../services/sound-manager'
import type { SpellIndexEntry } from '../../../types/data/spell-data-types'

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function SpellCard({ spell }: { spell: SpellIndexEntry }): JSX.Element {
  const { t } = useT()
  const [expanded, setExpanded] = useState(false)
  const levelLabel = spell.level === 0 ? t('game.spellsTab.cantrip') : t('game.spellsTab.level', { level: spell.level })
  const classList = spell.classes.join(', ')

  return (
    <div
      className="bg-surface-2/50 rounded-lg px-3 py-2 border border-border/30 cursor-pointer hover:border-gray-600/50 transition-colors"
      onClick={() => {
        if (!expanded && spell.school) playSpellSound(spell.school)
        setExpanded(!expanded)
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-accent truncate">{spell.name}</div>
        <div className="text-xs text-gray-500 shrink-0">{levelLabel}</div>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        {spell.school && <span className="text-xs text-muted">{spell.school}</span>}
        {spell.ritual && <span className="text-xs text-blue-400/70">{t('game.spellsTab.ritual')}</span>}
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
            <span className="text-gray-500">{t('game.spellsTab.components')}</span>
            <span className="text-gray-300">{Object.values(spell.components).filter(Boolean).join(', ')}</span>
          </div>
          {classList && (
            <div className="text-xs text-gray-500 mt-1">
              {t('game.spellsTab.classes')} <span className="text-muted">{classList}</span>
            </div>
          )}
          <p className="text-[11px] text-gray-300 mt-1.5 leading-relaxed">{spell.classes.join(', ')}</p>
        </div>
      )}
    </div>
  )
}

// CASTER_CLASSES computed inside the component via useMemo to stay reactive after async data loads

/** Resolve max cantrips known for a class at a given level from the threshold table */
function resolveCantripsKnown(classId: string, level: number): number {
  const table = CANTRIPS_KNOWN[classId]
  if (!table) return 0
  let known = 0
  for (const [lvl, count] of Object.entries(table)) {
    if (level >= Number(lvl)) known = count
  }
  return known
}

export default function SpellsTab(): JSX.Element {
  const { t } = useT()
  // Phase 15e / 22 H4 — go through the library truth store, not the direct IPC bypass.
  // boundary cast: SpellData (components: string) reinterpreted as SpellIndexEntry (components object + path)
  const { data: spells = [], loading } = useAsyncData(
    () => load5eSpells().then((data) => data as unknown as SpellIndexEntry[]),
    []
  )
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<number | null>(null)
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null)
  const [refClass, setRefClass] = useState<string | null>(null)
  const [refLevel, setRefLevel] = useState(1)

  const casterClasses = useMemo(() => Object.keys(CANTRIPS_KNOWN), [])

  const filtered = useMemo(() => {
    let result = spells
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((s) => s.name.toLowerCase().includes(q))
    }
    if (levelFilter !== null) {
      result = result.filter((s) => s.level === levelFilter)
    }
    if (schoolFilter) {
      result = result.filter((s) => s.school.toLowerCase() === schoolFilter.toLowerCase())
    }
    return result
  }, [spells, search, levelFilter, schoolFilter])

  if (loading) {
    return <p className="text-xs text-gray-500 text-center py-4">{t('game.spellsTab.loading')}</p>
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Search bar */}
      <input
        type="text"
        name="spell-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('game.spellsTab.searchPlaceholder')}
        className="w-full px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border text-xs text-fg placeholder-gray-500 focus:outline-none focus:border-amber-500/60"
      />

      {/* Level filter */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setLevelFilter(null)}
          className={`px-1.5 py-0.5 text-xs rounded cursor-pointer transition-colors ${
            levelFilter === null ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:text-gray-200'
          }`}
        >
          {t('game.spellsTab.all')}
        </button>
        {SPELL_LEVELS.map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(levelFilter === lvl ? null : lvl)}
            className={`px-1.5 py-0.5 text-xs rounded cursor-pointer transition-colors ${
              levelFilter === lvl ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:text-gray-200'
            }`}
          >
            {lvl === 0 ? 'C' : lvl}
          </button>
        ))}
      </div>

      {/* School filter */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setSchoolFilter(null)}
          className={`px-1.5 py-0.5 text-xs rounded cursor-pointer transition-colors ${
            schoolFilter === null ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:text-gray-200'
          }`}
        >
          {t('game.spellsTab.allSchools')}
        </button>
        {SPELL_SCHOOLS.map((school) => (
          <button
            key={school}
            onClick={() => setSchoolFilter(schoolFilter === school ? null : school)}
            className={`px-1.5 py-0.5 text-xs rounded cursor-pointer transition-colors ${
              schoolFilter === school ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:text-gray-200'
            }`}
          >
            {school.slice(0, 4)}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-500">{t('game.spellsTab.spellCount', { count: filtered.length })}</div>

      {/* Caster quick-reference */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-gray-500">{t('game.spellsTab.ref')}</span>
        {casterClasses.map((cls) => (
          <button
            key={cls}
            onClick={() => setRefClass(refClass === cls ? null : cls)}
            className={`px-1 py-0.5 text-[9px] rounded cursor-pointer transition-colors ${
              refClass === cls ? 'bg-purple-600 text-white' : 'bg-surface-2 text-gray-500 hover:text-gray-300'
            }`}
          >
            {cls.charAt(0).toUpperCase() + cls.slice(1, 4)}
          </button>
        ))}
      </div>
      {refClass && (
        <div className="bg-surface-2/50 border border-border/30 rounded-lg px-2 py-1.5 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{t('game.spellsTab.lv')}</span>
            <input
              type="number"
              name="ref-level"
              min={1}
              max={20}
              value={refLevel}
              onChange={(e) => setRefLevel(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
              className="w-10 bg-surface-2 border border-gray-600 rounded text-center text-xs text-gray-200 px-0.5 py-0.5"
            />
            <span className="text-xs text-gray-300">
              {t('game.spellsTab.cantripsLabel')}{' '}
              <span className="text-accent font-semibold">{resolveCantripsKnown(refClass, refLevel)}</span>
            </span>
            {refClass === 'warlock' && (
              <span className="text-xs text-gray-300">
                {t('game.spellsTab.pactSlotLv')}{' '}
                <span className="text-purple-400 font-semibold">{getWarlockMaxSpellLevel(refLevel)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Spell list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">{t('game.spellsTab.noMatching')}</p>
        ) : (
          filtered.map((spell) => <SpellCard key={spell.id} spell={spell} />)
        )}
      </div>
    </div>
  )
}
