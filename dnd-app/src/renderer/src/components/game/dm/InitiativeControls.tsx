import { useState } from 'react'
import { useT } from '../../../i18n'
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
  const { t } = useT()
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
              {timerExpired ? t('game.initiativeControls.timeUp') : formatTime(timeRemaining)}
            </span>
            {timerExpired && timerAction === 'warning' && (
              <span className="text-[9px] text-red-400/70 animate-pulse">
                {t('game.initiativeControls.turnExpired')}
              </span>
            )}
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
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
        <div className="border-t border-border/50 pt-1">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            {t('game.initiativeControls.delayed')}
          </div>
          {delayedEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 p-1.5 rounded bg-surface-2/30 text-xs text-muted mb-0.5"
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
                className="text-xs px-1.5 py-0.5 rounded bg-amber-700/50 text-amber-300 hover:bg-amber-600/50 cursor-pointer"
              >
                {t('game.initiativeControls.reEnter')}
              </button>
              <button
                onClick={() => onRemoveDelayed(entry.entityId)}
                aria-label={t('game.initiativeControls.removeDelayed')}
                title={t('game.initiativeControls.removeDelayed')}
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
                aria-label={t('game.initiativeControls.namePlaceholder')}
                type="text"
                placeholder={t('game.initiativeControls.namePlaceholder')}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="flex-1 p-1 rounded bg-surface-2 border border-border text-fg placeholder-gray-600 text-xs focus:outline-none focus:border-amber-500"
              />
              <input
                aria-label={t('game.initiativeControls.initPlaceholder')}
                type="number"
                placeholder={t('game.initiativeControls.initPlaceholder')}
                value={addInit}
                onChange={(e) => setAddInit(e.target.value)}
                className="w-12 p-1 rounded bg-surface-2 border border-border text-fg text-center text-xs focus:outline-none focus:border-amber-500"
              />
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value as 'player' | 'npc' | 'enemy')}
                className="w-14 p-1 rounded bg-surface-2 border border-border text-gray-200 text-xs cursor-pointer"
              >
                <option value="player">{t('game.initiativeControls.typePlayer')}</option>
                <option value="npc">{t('game.initiativeControls.typeNpc')}</option>
                <option value="enemy">{t('game.initiativeControls.typeEnemy')}</option>
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
                className="px-2 py-1 text-xs rounded bg-green-700 text-white hover:bg-green-600 cursor-pointer"
              >
                {t('game.initiativeControls.add')}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                aria-label={t('game.initiativeControls.cancelAdding')}
                title={t('common.actions.cancel')}
                className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
              >
                &#x2715;
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-1 text-xs rounded bg-surface-2 text-muted hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer"
            >
              {t('game.initiativeControls.addEntry')}
            </button>
          )}
          <div className="flex gap-1" role="group" aria-label={t('game.initiativeControls.turnControls')}>
            <button
              onClick={onPrevTurn}
              aria-label={t('game.initiativeControls.previousTurn')}
              className="flex-1 py-1.5 text-xs rounded-lg bg-surface-2 text-muted
                hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer"
            >
              {t('game.initiativeControls.prev')}
            </button>
            <button
              onClick={onNextTurn}
              aria-label={t('game.initiativeControls.nextTurn')}
              className="flex-2 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-accent-strong text-white
                font-semibold transition-colors cursor-pointer"
            >
              {t('game.initiativeControls.nextTurn')}
            </button>
            <button
              onClick={onEndInitiative}
              aria-label={t('game.initiativeControls.endInitiative')}
              className="flex-1 py-1.5 text-xs rounded-lg bg-surface-2 text-muted
                hover:bg-red-700 hover:text-white transition-colors cursor-pointer"
            >
              {t('game.initiativeControls.end')}
            </button>
          </div>
        </>
      )}
    </>
  )
}
