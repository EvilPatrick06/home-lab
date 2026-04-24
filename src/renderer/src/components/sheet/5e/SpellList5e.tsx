import { useState } from 'react'
import type { SpellEntry } from '../../../types/character-common'

function parseComponents(comp?: string): { V: boolean; S: boolean; M: boolean; desc?: string } {
  if (!comp) return { V: false, S: false, M: false }
  return {
    V: /\bV\b/.test(comp),
    S: /\bS\b/.test(comp),
    M: /\bM\b/.test(comp),
    desc: comp.match(/M\s*\(([^)]+)\)/)?.[1]
  }
}

interface SpellRowProps {
  spell: SpellEntry
  readonly?: boolean
  preparedSpellIds: string[]
  onTogglePrepared?: (spellId: string) => void
  onToggleInnateUse?: (spellId: string) => void
  onCastRitual?: (spell: SpellEntry) => void
  onConcentrationWarning?: (spell: SpellEntry) => void
  onCastSpell?: (spell: SpellEntry, slotLevel: number) => void
  spellSlotLevels?: Record<number, { current: number; max: number }>
  isCantrip: boolean
  proficiencyBonus?: number
  isConcentrating?: boolean
  concentratingSpell?: string
}

function SpellRow({
  spell,
  readonly,
  preparedSpellIds,
  onTogglePrepared,
  onToggleInnateUse,
  onCastRitual,
  onConcentrationWarning,
  onCastSpell,
  spellSlotLevels,
  isCantrip,
  proficiencyBonus,
  isConcentrating,
  concentratingSpell
}: SpellRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [showSlotPicker, setShowSlotPicker] = useState(false)
  const isPrepared = preparedSpellIds.includes(spell.id)
  const isSpecies = spell.source === 'species' || spell.id.startsWith('species-')
  const isItem = spell.source === 'item'
  const hasInnateUses = spell.innateUses && spell.innateUses.max !== 0
  const innateMax = hasInnateUses
    ? spell.innateUses?.max === -1
      ? (proficiencyBonus ?? 2)
      : (spell.innateUses?.max ?? 0)
    : 0
  const innateRemaining = hasInnateUses
    ? spell.innateUses?.remaining === -1
      ? (proficiencyBonus ?? 2)
      : (spell.innateUses?.remaining ?? 0)
    : 0

  const isConcentratingOnThis = isConcentrating && concentratingSpell === spell.name

  return (
    <div
      className={`border-b border-gray-800 last:border-0 ${isConcentratingOnThis ? 'border-l-2 border-l-yellow-500' : ''}`}
    >
      <div className="flex items-center">
        {!isCantrip && !isSpecies && !isItem && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!readonly && onTogglePrepared) {
                onTogglePrepared(spell.id)
              }
            }}
            disabled={readonly}
            className={`flex-shrink-0 w-4 h-4 ml-2 rounded border transition-colors ${
              isPrepared ? 'bg-amber-500 border-amber-400' : 'border-gray-600 bg-gray-800'
            } ${readonly ? 'opacity-50 cursor-default' : 'cursor-pointer hover:border-amber-500'}`}
            title={isPrepared ? 'Unprepare spell' : 'Prepare spell'}
          >
            {isPrepared && (
              <svg className="w-4 h-4 text-gray-900" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z" />
              </svg>
            )}
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between px-2 py-1.5 hover:bg-gray-800/50 transition-colors text-left text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-200">{spell.name}</span>
            {isSpecies && (
              <span className="text-[10px] text-purple-400 border border-purple-700 rounded px-1">Species</span>
            )}
            {isItem && <span className="text-[10px] text-teal-400 border border-teal-700 rounded px-1">Item</span>}
            {spell.concentration && (
              <span className="text-[10px] text-yellow-500 border border-yellow-700 rounded px-1">C</span>
            )}
            {spell.ritual && <span className="text-[10px] text-blue-400 border border-blue-700 rounded px-1">R</span>}
            {(() => {
              const c = parseComponents(spell.components)
              const costWarning = c.desc && /\d+\s*gp/i.test(c.desc)
              return (
                <>
                  {c.V && (
                    <span className="text-[10px] text-sky-400 border border-sky-700 rounded px-1" title="Verbal">
                      V
                    </span>
                  )}
                  {c.S && (
                    <span className="text-[10px] text-orange-400 border border-orange-700 rounded px-1" title="Somatic">
                      S
                    </span>
                  )}
                  {c.M && (
                    <span
                      className={`text-[10px] ${costWarning ? 'text-red-400 border-red-700' : 'text-emerald-400 border-emerald-700'} border rounded px-1`}
                      title={c.desc ? `Material: ${c.desc}` : 'Material component required'}
                    >
                      M
                    </span>
                  )}
                </>
              )
            })()}
            {/* Innate use pips */}
            {hasInnateUses && innateMax > 0 && (
              <div className="flex gap-0.5 ml-1">
                {Array.from({ length: innateMax }, (_, i) => {
                  const isFilled = i < innateRemaining
                  return (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!readonly && onToggleInnateUse) onToggleInnateUse(spell.id)
                      }}
                      disabled={readonly}
                      className={`w-3 h-3 rounded-full border transition-colors ${
                        isFilled ? 'bg-purple-500 border-purple-400' : 'border-gray-600 bg-gray-800'
                      } ${readonly ? 'cursor-default' : 'cursor-pointer hover:border-purple-400'}`}
                      title={isFilled ? 'Use innate casting' : 'Restore innate casting'}
                    />
                  )
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{spell.castingTime}</span>
            <span>{spell.range}</span>
          </div>
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-2 text-xs text-gray-400 space-y-1">
          <div className="flex gap-3 text-gray-500">
            <span>Duration: {spell.duration}</span>
            <span>Components: {spell.components}</span>
            {spell.school && <span>School: {spell.school}</span>}
          </div>
          <p className="leading-relaxed whitespace-pre-wrap">{spell.description}</p>
          {spell.higherLevels && (
            <p className="text-xs text-blue-300 italic mt-1">At Higher Levels: {spell.higherLevels}</p>
          )}
          {!readonly && !isCantrip && (
            <div className="flex gap-2 pt-1 flex-wrap">
              {spell.ritual && onCastRitual && (
                <button
                  onClick={() => onCastRitual(spell)}
                  className="px-2 py-0.5 rounded bg-blue-700/50 text-blue-300 hover:bg-blue-600/50 cursor-pointer text-[10px] transition-colors"
                  title="Cast as ritual (no spell slot, +10 min casting time)"
                >
                  Cast as Ritual
                </button>
              )}
              {spell.concentration && isConcentrating && onConcentrationWarning && (
                <button
                  onClick={() => onConcentrationWarning(spell)}
                  className="px-2 py-0.5 rounded bg-yellow-700/50 text-yellow-300 hover:bg-yellow-600/50 cursor-pointer text-[10px] transition-colors"
                  title="You are already concentrating — casting this will end your current concentration"
                >
                  Cast (Drop Concentration)
                </button>
              )}
              {onCastSpell && !isSpecies && spellSlotLevels && (
                <>
                  <button
                    onClick={() => setShowSlotPicker(!showSlotPicker)}
                    className="px-2 py-0.5 rounded bg-amber-700/50 text-amber-300 hover:bg-amber-600/50 cursor-pointer text-[10px] transition-colors"
                    title="Cast using a spell slot"
                  >
                    {showSlotPicker ? 'Cancel' : 'Cast'}
                  </button>
                  {showSlotPicker && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-500">Slot:</span>
                      {Array.from({ length: 10 - spell.level }, (_, i) => spell.level + i)
                        .filter((lvl) => spellSlotLevels[lvl] && spellSlotLevels[lvl].current > 0)
                        .map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => {
                              onCastSpell(spell, lvl)
                              setShowSlotPicker(false)
                            }}
                            className={`w-6 h-6 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                              lvl === spell.level
                                ? 'bg-amber-600 text-white hover:bg-amber-500'
                                : 'bg-indigo-700/60 text-indigo-200 hover:bg-indigo-600/60'
                            }`}
                            title={`Cast at level ${lvl} (${spellSlotLevels[lvl].current}/${spellSlotLevels[lvl].max} remaining)`}
                          >
                            {lvl}
                          </button>
                        ))}
                      {Array.from({ length: 10 - spell.level }, (_, i) => spell.level + i).filter(
                        (lvl) => spellSlotLevels[lvl] && spellSlotLevels[lvl].current > 0
                      ).length === 0 && <span className="text-[10px] text-red-400">No slots available</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
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

interface SpellList5eProps {
  spellsByLevel: Map<number, SpellEntry[]>
  readonly?: boolean
  preparedSpellIds: string[]
  onTogglePrepared: (spellId: string) => void
  onToggleInnateUse: (spellId: string) => void
  onCastRitual: (spell: SpellEntry) => void
  onConcentrationWarning: (spell: SpellEntry) => void
  onCastSpell?: (spell: SpellEntry, slotLevel: number) => void
  spellSlotLevels?: Record<number, { current: number; max: number }>
  proficiencyBonus: number
  isConcentrating: boolean
  concentratingSpell?: string
}

export default function SpellList5e({
  spellsByLevel,
  readonly,
  preparedSpellIds,
  onTogglePrepared,
  onToggleInnateUse,
  onCastRitual,
  onConcentrationWarning,
  onCastSpell,
  spellSlotLevels,
  proficiencyBonus,
  isConcentrating,
  concentratingSpell
}: SpellList5eProps): JSX.Element | null {
  if (spellsByLevel.size === 0) return null

  return (
    <div>
      {Array.from(spellsByLevel.entries())
        .sort(([a], [b]) => a - b)
        .map(([level, spells]) => (
          <div key={level} className="mb-2">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
              {level === 0 ? 'Cantrips' : `${level}${ordinal(level)} Level`}
            </div>
            {spells.map((spell) => (
              <SpellRow
                key={spell.id}
                spell={spell}
                readonly={readonly}
                preparedSpellIds={preparedSpellIds}
                onTogglePrepared={onTogglePrepared}
                onToggleInnateUse={onToggleInnateUse}
                onCastRitual={onCastRitual}
                onConcentrationWarning={onConcentrationWarning}
                onCastSpell={onCastSpell}
                spellSlotLevels={spellSlotLevels}
                isCantrip={level === 0}
                proficiencyBonus={proficiencyBonus}
                isConcentrating={isConcentrating}
                concentratingSpell={concentratingSpell}
              />
            ))}
          </div>
        ))}
    </div>
  )
}
