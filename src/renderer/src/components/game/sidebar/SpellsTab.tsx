import { useEffect, useMemo, useState } from 'react'
import { SPELL_SCHOOLS } from '../../../constants'
import type {
  HigherLevelCasting,
  HigherLevelScalingEntry,
  SpellAction,
  SpellComponents,
  SpellD20Modifier,
  SpellDamageData,
  SpellDuration,
  SpellHealingData,
  SpellRange
} from '../../../services/character/spell-data'
import { CANTRIPS_KNOWN, getWarlockMaxSpellLevel } from '../../../services/character/spell-preparation-analyzer'
import { playSpellSound } from '../../../services/sound-manager'
import type { SpellIndexEntry } from '../../../types/data/spell-data-types'

type _SpellAction = SpellAction
type _SpellRange = SpellRange
type _SpellComponents = SpellComponents
type _SpellDuration = SpellDuration
type _SpellDamageData = SpellDamageData
type _SpellHealingData = SpellHealingData
type _SpellD20Modifier = SpellD20Modifier
type _HigherLevelScalingEntry = HigherLevelScalingEntry
type _HigherLevelCasting = HigherLevelCasting

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

function SpellCard({ spell }: { spell: SpellIndexEntry }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const levelLabel = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`
  const classList = spell.classes.join(', ')

  return (
    <div
      className="bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/30 cursor-pointer hover:border-gray-600/50 transition-colors"
      onClick={() => {
        if (!expanded && spell.school) playSpellSound(spell.school)
        setExpanded(!expanded)
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-amber-400 truncate">{spell.name}</div>
        <div className="text-[10px] text-gray-500 shrink-0">{levelLabel}</div>
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        {spell.school && <span className="text-[10px] text-gray-400">{spell.school}</span>}
        {spell.ritual && <span className="text-[10px] text-blue-400/70">Ritual</span>}
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-gray-700/30 space-y-1">
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
            <span className="text-gray-500">Components</span>
            <span className="text-gray-300">{Object.values(spell.components).filter(Boolean).join(', ')}</span>
          </div>
          {classList && (
            <div className="text-[10px] text-gray-500 mt-1">
              Classes: <span className="text-gray-400">{classList}</span>
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
  const [spells, setSpells] = useState<SpellIndexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<number | null>(null)
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null)
  const [refClass, setRefClass] = useState<string | null>(null)
  const [refLevel, setRefLevel] = useState(1)

  useEffect(() => {
    let cancelled = false
    window.api.game.loadSpells().then((data: unknown) => {
      const spellData = data as SpellIndexEntry[]
      if (!cancelled) {
        setSpells(spellData)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

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
    return <p className="text-xs text-gray-500 text-center py-4">Loading spells...</p>
  }

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {/* Search bar */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search spells..."
        className="w-full px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500/60"
      />

      {/* Level filter */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setLevelFilter(null)}
          className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
            levelFilter === null ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          All
        </button>
        {SPELL_LEVELS.map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(levelFilter === lvl ? null : lvl)}
            className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
              levelFilter === lvl ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
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
          className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
            schoolFilter === null ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          All Schools
        </button>
        {SPELL_SCHOOLS.map((school) => (
          <button
            key={school}
            onClick={() => setSchoolFilter(schoolFilter === school ? null : school)}
            className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
              schoolFilter === school ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {school.slice(0, 4)}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="text-[10px] text-gray-500">
        {filtered.length} spell{filtered.length !== 1 ? 's' : ''} found
      </div>

      {/* Caster quick-reference */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-gray-500">Ref:</span>
        {casterClasses.map((cls) => (
          <button
            key={cls}
            onClick={() => setRefClass(refClass === cls ? null : cls)}
            className={`px-1 py-0.5 text-[9px] rounded cursor-pointer transition-colors ${
              refClass === cls ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            {cls.charAt(0).toUpperCase() + cls.slice(1, 4)}
          </button>
        ))}
      </div>
      {refClass && (
        <div className="bg-gray-800/50 border border-gray-700/30 rounded-lg px-2 py-1.5 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">Lv</span>
            <input
              type="number"
              min={1}
              max={20}
              value={refLevel}
              onChange={(e) => setRefLevel(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
              className="w-10 bg-gray-800 border border-gray-600 rounded text-center text-[10px] text-gray-200 px-0.5 py-0.5"
            />
            <span className="text-[10px] text-gray-300">
              Cantrips: <span className="text-amber-400 font-semibold">{resolveCantripsKnown(refClass, refLevel)}</span>
            </span>
            {refClass === 'warlock' && (
              <span className="text-[10px] text-gray-300">
                Pact slot lv: <span className="text-purple-400 font-semibold">{getWarlockMaxSpellLevel(refLevel)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Spell list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No matching spells</p>
        ) : (
          filtered.map((spell) => <SpellCard key={spell.id} spell={spell} />)
        )}
      </div>
    </div>
  )
}
