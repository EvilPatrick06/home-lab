import { useState } from 'react'
import { useT } from '../../../i18n'
import type { SpellData } from './SpellSummary5e'
import { ordinal, SpellRow } from './SpellSummary5e'

interface SpellPickerProps {
  availableSpells: SpellData[]
  selectedSpellIds: string[]
  toggleSpell: (id: string) => void
  offListSpellIds?: Set<string>
}

export default function SpellPicker5e({
  availableSpells,
  selectedSpellIds,
  toggleSpell,
  offListSpellIds
}: SpellPickerProps): JSX.Element {
  const { t } = useT()
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all')

  const filtered = availableSpells.filter((s) => {
    if (levelFilter !== 'all' && s.level !== levelFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const spellLevels = [...new Set(filtered.map((s) => s.level))].sort((a, b) => a - b)

  return (
    <>
      {/* Filters */}
      <div className="px-4 py-2 border-b border-gray-800 flex gap-2 items-center">
        <input
          type="text"
          placeholder={t('builder.spellPicker.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-600"
        />
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:outline-none"
        >
          <option value="all">{t('builder.spellPicker.allLevels')}</option>
          <option value="0">{t('builder.spellPicker.cantrips')}</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
            <option key={l} value={l}>
              {t('builder.spellPicker.levelOption', { level: l, ord: ordinal(l) })}
            </option>
          ))}
        </select>
      </div>

      {/* Spell list */}
      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-500">{t('builder.spellPicker.noSpells')}</p>
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          {spellLevels.map((level) => {
            const spells = filtered.filter((s) => s.level === level)
            if (spells.length === 0) return null
            return (
              <div key={level}>
                <div className="px-4 py-1 bg-gray-900/60 sticky top-0">
                  <span className="text-xs font-semibold text-gray-400 uppercase">
                    {level === 0
                      ? t('builder.spellPicker.cantrips')
                      : t('builder.spellPicker.levelHeader', { level, ord: ordinal(level) })}
                    <span className="text-gray-600 ml-1">
                      {t('builder.spellPicker.count', { count: spells.length })}
                    </span>
                  </span>
                </div>
                {spells.map((spell) => (
                  <SpellRow
                    key={spell.id}
                    spell={spell}
                    selected={selectedSpellIds.includes(spell.id)}
                    onToggle={() => toggleSpell(spell.id)}
                    isOffList={offListSpellIds?.has(spell.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
