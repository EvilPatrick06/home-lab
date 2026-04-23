import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../../../stores/use-game-store'
import type { DiceRollRecord } from '../../../types/game-state'

interface DiceHistoryProps {
  onClose?: () => void
}

export default function DiceHistory({ onClose }: DiceHistoryProps): JSX.Element {
  const diceHistory: DiceRollRecord[] = useGameStore((s) => s.diceHistory)
  const [filterPlayer, setFilterPlayer] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const playerNames = useMemo(() => {
    const names = new Set<string>()
    for (const roll of diceHistory) names.add(roll.rollerName)
    return Array.from(names).sort()
  }, [diceHistory])

  const filtered = useMemo(() => {
    if (!filterPlayer) return diceHistory
    return diceHistory.filter((r) => r.rollerName === filterPlayer)
  }, [diceHistory, filterPlayer])

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  const formatTime = useCallback((ts: number) => {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }, [])

  return (
    <div className="w-72 h-full bg-gray-900/95 border-l border-gray-700 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <h2 className="text-sm font-bold text-gray-100">Dice History</h2>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">{diceHistory.length} rolls</span>
          {onClose && (
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 rounded hover:bg-gray-800 cursor-pointer transition-colors"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Player filter */}
      {playerNames.length > 1 && (
        <div className="shrink-0 flex gap-1 px-3 py-2 border-b border-gray-700 flex-wrap">
          <button
            onClick={() => setFilterPlayer(null)}
            className={`px-2 py-0.5 text-[10px] font-semibold rounded cursor-pointer transition-colors ${
              !filterPlayer
                ? 'bg-amber-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
            }`}
          >
            All
          </button>
          {playerNames.map((name) => (
            <button
              key={name}
              onClick={() => setFilterPlayer(filterPlayer === name ? null : name)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded cursor-pointer transition-colors ${
                filterPlayer === name
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Roll list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 min-h-0 space-y-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-xs text-gray-500">No dice rolls yet.</p>
            <p className="text-[10px] text-gray-600 mt-1">Rolls will appear here as they happen.</p>
          </div>
        ) : (
          filtered.map((roll) => (
            <div
              key={roll.id}
              className={`rounded-lg px-2.5 py-1.5 border ${
                roll.isCritical
                  ? 'bg-amber-900/20 border-amber-600/40'
                  : roll.isFumble
                    ? 'bg-red-900/20 border-red-600/40'
                    : 'bg-gray-800/40 border-gray-700/30'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-gray-200 truncate">{roll.rollerName}</span>
                <span className="text-[9px] text-gray-600 shrink-0">{formatTime(roll.timestamp)}</span>
              </div>

              {roll.reason && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{roll.reason}</div>}

              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-gray-500 font-mono">{roll.formula}</span>
                <span className="text-[10px] text-gray-600">=</span>
                <div className="flex gap-0.5">
                  {roll.rolls.map((die, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded bg-gray-700/60 text-gray-200"
                    >
                      {die}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-gray-600">=</span>
                <span
                  className={`text-xs font-bold ${
                    roll.isCritical ? 'text-amber-400' : roll.isFumble ? 'text-red-400' : 'text-gray-100'
                  }`}
                >
                  {roll.total}
                </span>
                {roll.isCritical && <span className="text-[9px] text-amber-400 font-bold">CRIT!</span>}
                {roll.isFumble && <span className="text-[9px] text-red-400 font-bold">FUMBLE</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
