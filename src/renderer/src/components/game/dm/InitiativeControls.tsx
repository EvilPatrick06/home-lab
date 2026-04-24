import { useState } from 'react'
import type { InitiativeEntry } from '../../../types/game-state'

interface InitiativeControlsProps {
  isHost: boolean
  timerEnabled: boolean
  timerRunning: boolean
  timerExpired: boolean
  timerAction: 'warning' | 'auto-skip'
  timeRemaining: number
  timerSeconds: number
  delayedEntries: InitiativeEntry[]
  onAddEntry?: (entry: InitiativeEntry) => void
  onReenterDelayed: (entry: InitiativeEntry) => void
  onRemoveDelayed: (entityId: string) => void
  onPrevTurn: () => void
  onNextTurn: () => void
  onEndInitiative: () => void
}

/** Format seconds as M:SS */
function formatTime(s: number): string {
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function InitiativeControls({
  isHost,
  timerEnabled,
  timerRunning,
  timerExpired,
  timerAction,
  timeRemaining,
  timerSeconds,
  delayedEntries,
  onAddEntry,
  onReenterDelayed,
  onRemoveDelayed,
  onPrevTurn,
  onNextTurn,
  onEndInitiative
}: InitiativeControlsProps): JSX.Element {
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addInit, setAddInit] = useState('')
  const [addType, setAddType] = useState<'player' | 'npc' | 'enemy'>('enemy')

  // Timer progress bar helper
  const timerProgressPercent = timerSeconds > 0 ? (timeRemaining / timerSeconds) * 100 : 0
  const timerColor =
    timeRemaining <= 10 ? 'bg-red-500' : timeRemaining <= timerSeconds * 0.33 ? 'bg-yellow-500' : 'bg-green-500'
  const timerFlash = timeRemaining <= 10 && timeRemaining > 0 && timerRunning

  return (
    <>
      {/* Combat Timer Bar */}
      {isHost && timerEnabled && (timerRunning || timerExpired) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-mono font-semibold ${
                timerExpired
                  ? 'text-red-400 animate-pulse'
                  : timeRemaining <= 10
                    ? 'text-red-400'
                    : timeRemaining <= timerSeconds * 0.33
                      ? 'text-yellow-400'
                      : 'text-gray-300'
              }`}
            >
              {timerExpired ? 'TIME!' : formatTime(timeRemaining)}
            </span>
            {timerExpired && timerAction === 'warning' && (
              <span className="text-[9px] text-red-400/70 animate-pulse">Turn expired</span>
            )}
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${timerColor} ${
                timerFlash ? 'animate-pulse' : ''
              }`}
              style={{ width: `${timerProgressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Delayed entries */}
      {delayedEntries.length > 0 && isHost && (
        <div className="border-t border-gray-700/50 pt-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Delayed</div>
          {delayedEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 p-1.5 rounded bg-gray-800/30 text-xs text-gray-400 mb-0.5"
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  entry.entityType === 'player'
                    ? 'bg-blue-500'
                    : entry.entityType === 'enemy'
                      ? 'bg-red-500'
                      : 'bg-yellow-500'
                }`}
              />
              <span className="flex-1 truncate">{entry.entityName}</span>
              <button
                onClick={() => onReenterDelayed(entry)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-700/50 text-amber-300 hover:bg-amber-600/50 cursor-pointer"
              >
                Re-enter
              </button>
              <button
                onClick={() => onRemoveDelayed(entry.entityId)}
                className="text-gray-600 hover:text-red-400 cursor-pointer"
              >
                &#x2715;
              </button>
            </div>
          ))}
        </div>
      )}

      {isHost && (
        <>
          {/* Add entry mid-combat */}
          {showAddForm ? (
            <div className="flex gap-1 items-center">
              <input
                type="text"
                placeholder="Name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="flex-1 p-1 rounded bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 text-xs focus:outline-none focus:border-amber-500"
              />
              <input
                type="number"
                placeholder="Init"
                value={addInit}
                onChange={(e) => setAddInit(e.target.value)}
                className="w-12 p-1 rounded bg-gray-800 border border-gray-700 text-gray-100 text-center text-xs focus:outline-none focus:border-amber-500"
              />
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as 'player' | 'npc' | 'enemy')}
                className="w-14 p-1 rounded bg-gray-800 border border-gray-700 text-gray-200 text-xs cursor-pointer"
              >
                <option value="player">PC</option>
                <option value="npc">NPC</option>
                <option value="enemy">Foe</option>
              </select>
              <button
                onClick={() => {
                  if (!addName.trim()) return
                  const total = parseInt(addInit, 10) || 0
                  const entry: InitiativeEntry = {
                    id: crypto.randomUUID(),
                    entityId: crypto.randomUUID(),
                    entityName: addName.trim(),
                    entityType: addType,
                    roll: total,
                    modifier: 0,
                    total,
                    isActive: false
                  }
                  onAddEntry?.(entry)
                  setAddName('')
                  setAddInit('')
                  setShowAddForm(false)
                }}
                className="px-2 py-1 text-[10px] rounded bg-green-700 text-white hover:bg-green-600 cursor-pointer"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
              >
                &#x2715;
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-1 text-[10px] rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer"
            >
              + Add Entry
            </button>
          )}
          <div className="flex gap-1" role="group" aria-label="Initiative turn controls">
            <button
              onClick={onPrevTurn}
              aria-label="Previous turn"
              className="flex-1 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-400
                hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer"
            >
              Prev
            </button>
            <button
              onClick={onNextTurn}
              aria-label="Next turn"
              className="flex-2 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white
                font-semibold transition-colors cursor-pointer"
            >
              Next Turn
            </button>
            <button
              onClick={onEndInitiative}
              aria-label="End initiative"
              className="flex-1 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-400
                hover:bg-red-700 hover:text-white transition-colors cursor-pointer"
            >
              End
            </button>
          </div>
        </>
      )}
    </>
  )
}
