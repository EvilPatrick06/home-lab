import { useState } from 'react'
import type { Character5e, HitPoints } from '../../../types/character-5e'

interface PlayerHUDStatsProps {
  characterName: string
  hp: HitPoints
  ac: number
  char5e: Character5e | null
  expanded: boolean
  onAdjustHP: (delta: number) => void
  onEditHP: (value: number) => void
  renderSlotPips: (level: number, current: number, max: number, isPact?: boolean) => JSX.Element
}

export default function PlayerHUDStats({
  characterName,
  hp,
  ac,
  char5e,
  expanded,
  onAdjustHP,
  onEditHP,
  renderSlotPips
}: PlayerHUDStatsProps): JSX.Element {
  const [editingHP, setEditingHP] = useState(false)
  const [hpInput, setHpInput] = useState('')

  const hpPercent = hp.maximum > 0 ? Math.max(0, (hp.current / hp.maximum) * 100) : 0
  const hpColor = hpPercent > 50 ? 'bg-green-500' : hpPercent > 25 ? 'bg-yellow-500' : 'bg-red-500'

  const handleHPEdit = (): void => {
    const val = parseInt(hpInput, 10)
    if (!Number.isNaN(val)) {
      onEditHP(val)
    }
    setEditingHP(false)
  }

  return (
    <>
      {/* Name */}
      <span className="text-sm font-semibold text-gray-100 shrink-0">{characterName}</span>

      {/* HP bar (click to edit) */}
      <div className="flex items-center gap-1 min-w-[140px]">
        <span className="text-[10px] text-gray-500">HP</span>
        {editingHP ? (
          <input
            type="number"
            value={hpInput}
            onChange={(e) => setHpInput(e.target.value)}
            onBlur={handleHPEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleHPEdit()
              if (e.key === 'Escape') setEditingHP(false)
            }}
            className="w-14 bg-gray-800 border border-amber-500 rounded px-1 py-0.5 text-center text-xs text-gray-100 focus:outline-none"
          />
        ) : (
          <div
            className="flex-1 relative cursor-pointer"
            onClick={() => {
              setEditingHP(true)
              setHpInput(String(hp.current))
            }}
            title="Click to edit HP"
          >
            <div className="h-3.5 bg-gray-800/80 rounded-full overflow-hidden">
              <div
                className={`h-full ${hpColor} transition-all duration-300 rounded-full`}
                style={{ width: `${hpPercent}%` }}
              />
            </div>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white drop-shadow">
              {hp.current}/{hp.maximum}
              {hp.temporary > 0 && <span className="text-blue-300 ml-0.5">(+{hp.temporary})</span>}
            </span>
          </div>
        )}
        {/* +/- buttons */}
        <button
          onClick={() => onAdjustHP(-1)}
          className="w-5 h-5 text-[10px] bg-red-900/40 hover:bg-red-800/60 text-red-300 rounded cursor-pointer"
          title="Take 1 damage"
        >
          -
        </button>
        <button
          onClick={() => onAdjustHP(1)}
          className="w-5 h-5 text-[10px] bg-green-900/40 hover:bg-green-800/60 text-green-300 rounded cursor-pointer"
          title="Heal 1 HP"
        >
          +
        </button>
      </div>

      {/* AC */}
      <div className="flex items-center gap-1 text-xs">
        <span className="text-gray-500">AC</span>
        <span className="font-semibold text-gray-100">{ac}</span>
      </div>

      {/* Spell slot pips (collapsed -- just show counts) */}
      {char5e && Object.keys(char5e.spellSlotLevels ?? {}).length > 0 && !expanded && (
        <div className="flex gap-0.5 flex-wrap">
          {Object.entries(char5e.spellSlotLevels)
            .filter(([, s]) => s.max > 0)
            .slice(0, 4)
            .map(([level, slots]) => renderSlotPips(Number(level), slots.current, slots.max))}
        </div>
      )}
    </>
  )
}
