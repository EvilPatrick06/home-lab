import { useState } from 'react'
import type { Character5e, HitDiceEntry, HitPoints } from '../../../types/character-5e'
import type { ClassResource } from '../../../types/character-common'

interface PlayerHUDActionsProps {
  char5e: Character5e
  hp: HitPoints
  speed: number
  dexMod: number
  formatMod: (mod: number) => string
  onSetTempHP: (val: number) => void
  onToggleSpellSlot: (level: number) => void
  onTogglePactSlot: (level: number) => void
  onAdjustResource: (resourceId: string, delta: number) => void
  onToggleInspiration: () => void
  renderSlotPips: (level: number, current: number, max: number, isPact?: boolean) => JSX.Element
}

export default function PlayerHUDActions({
  char5e,
  hp,
  speed,
  dexMod,
  formatMod: formatModFn,
  onSetTempHP,
  onToggleSpellSlot: _onToggleSpellSlot,
  onTogglePactSlot: _onTogglePactSlot,
  onAdjustResource,
  onToggleInspiration,
  renderSlotPips
}: PlayerHUDActionsProps): JSX.Element {
  const [editingTempHP, setEditingTempHP] = useState(false)
  const [tempHPInput, setTempHPInput] = useState('')

  const handleTempHPSet = (): void => {
    const val = parseInt(tempHPInput, 10)
    if (!Number.isNaN(val) && val >= 0) {
      onSetTempHP(val)
    }
    setEditingTempHP(false)
  }

  const classResources: ClassResource[] = char5e.classResources ?? []
  const hitDice: HitDiceEntry[] = char5e.hitDice

  return (
    <>
      {/* Temp HP */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 w-14">Temp HP:</span>
        {editingTempHP ? (
          <input
            type="number"
            value={tempHPInput}
            onChange={(e) => setTempHPInput(e.target.value)}
            onBlur={handleTempHPSet}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTempHPSet()
              if (e.key === 'Escape') setEditingTempHP(false)
            }}
            className="w-12 bg-gray-800 border border-blue-500 rounded px-1 py-0.5 text-center text-xs text-gray-100 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setEditingTempHP(true)
              setTempHPInput(String(hp.temporary))
            }}
            className="text-xs text-blue-300 hover:text-blue-200 cursor-pointer"
          >
            {hp.temporary}
          </button>
        )}
        <span className="text-[10px] text-gray-600 ml-2">|</span>
        <span className="text-[10px] text-gray-500">Spd: {speed}ft</span>
        <span className="text-[10px] text-gray-500">Init: {formatModFn(dexMod)}</span>
      </div>

      {/* Spell Slots (full view) */}
      {Object.keys(char5e.spellSlotLevels ?? {}).length > 0 && (
        <div>
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Spell Slots</span>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {Object.entries(char5e.spellSlotLevels)
              .filter(([, s]) => s.max > 0)
              .map(([level, slots]) => renderSlotPips(Number(level), slots.current, slots.max))}
          </div>
        </div>
      )}

      {/* Pact Magic */}
      {char5e.pactMagicSlotLevels && Object.keys(char5e.pactMagicSlotLevels).length > 0 && (
        <div>
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Pact Magic</span>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {Object.entries(char5e.pactMagicSlotLevels)
              .filter(([, s]) => s.max > 0)
              .map(([level, slots]) => renderSlotPips(Number(level), slots.current, slots.max, true))}
          </div>
        </div>
      )}

      {/* Class Resources */}
      {classResources.length > 0 && (
        <div>
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Class Resources</span>
          <div className="space-y-0.5 mt-0.5">
            {classResources.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-400 text-[10px] min-w-[80px]">{r.name}:</span>
                <span className="text-amber-300 font-semibold text-[10px]">
                  {r.current}/{r.max}
                </span>
                <button
                  onClick={() => onAdjustResource(r.id, -1)}
                  disabled={r.current <= 0}
                  className="w-4 h-4 text-[9px] bg-red-900/40 hover:bg-red-800/60 disabled:bg-gray-800 disabled:text-gray-600 text-red-300 rounded cursor-pointer"
                >
                  -
                </button>
                <button
                  onClick={() => onAdjustResource(r.id, 1)}
                  disabled={r.current >= r.max}
                  className="w-4 h-4 text-[9px] bg-green-900/40 hover:bg-green-800/60 disabled:bg-gray-800 disabled:text-gray-600 text-green-300 rounded cursor-pointer"
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hit Dice & Heroic Inspiration */}
      <div className="flex items-center gap-4">
        <span className="text-[10px] text-gray-500">
          Hit Dice:{' '}
          <span className="text-amber-300">
            {hitDice.reduce((s, h) => s + h.current, 0)}/{hitDice.reduce((s, h) => s + h.maximum, 0)}
          </span>
          {hitDice.length > 1 ? ` (${hitDice.map((h) => `d${h.dieType}`).join('/')})` : ` d${hitDice[0]?.dieType ?? 8}`}
        </span>
        <button
          onClick={onToggleInspiration}
          className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer border ${
            char5e.heroicInspiration
              ? 'bg-amber-600/30 text-amber-300 border-amber-500/50'
              : 'bg-gray-800 text-gray-500 border-gray-700'
          }`}
          title="Heroic Inspiration: Reroll any d20 immediately after rolling. You must use the new roll. (Humans regain on Long Rest)"
        >
          {char5e.heroicInspiration ? '\u2605 Inspired' : '\u2606 Inspiration'}
        </button>
      </div>
    </>
  )
}
