import { useState } from 'react'
import { useGameStore } from '../../../stores/use-game-store'
import type { InitiativeEntry } from '../../../types/game-state'
import { InitiativeTracker } from '../dm'

interface InitiativeOverlayProps {
  isDM: boolean
}

function PortraitCircle({
  entry,
  size,
  onClick
}: {
  entry: InitiativeEntry
  size: 'sm' | 'md'
  onClick?: () => void
}): JSX.Element {
  const px = size === 'sm' ? 'w-5 h-5 text-[9px]' : 'w-8 h-8 text-xs'

  const bgColor =
    entry.entityType === 'player' ? 'bg-blue-600' : entry.entityType === 'enemy' ? 'bg-red-600' : 'bg-gray-500'

  const activeRing = entry.isActive ? 'ring-2 ring-amber-400 animate-pulse' : ''

  if (entry.portraitUrl) {
    return (
      <button
        onClick={onClick}
        aria-label={`Center on ${entry.entityName}`}
        className={`${px} rounded-full flex-shrink-0 overflow-hidden ${activeRing} ${onClick ? 'cursor-pointer hover:brightness-125' : ''}`}
        title={`Center on ${entry.entityName}`}
      >
        <img src={entry.portraitUrl} alt={entry.entityName} className="w-full h-full object-cover" />
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`${px} rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white ${bgColor} ${activeRing} ${onClick ? 'cursor-pointer hover:brightness-125' : ''}`}
      aria-label={`Center on ${entry.entityName}`}
      title={`Center on ${entry.entityName}`}
    >
      {entry.entityName.charAt(0).toUpperCase()}
    </button>
  )
}

export default function InitiativeOverlay({ isDM }: InitiativeOverlayProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const initiative = useGameStore((s) => s.initiative)
  const round = useGameStore((s) => s.round)
  const startInitiative = useGameStore((s) => s.startInitiative)
  const nextTurn = useGameStore((s) => s.nextTurn)
  const prevTurn = useGameStore((s) => s.prevTurn)
  const endInitiative = useGameStore((s) => s.endInitiative)
  const updateInitiativeEntry = useGameStore((s) => s.updateInitiativeEntry)
  const removeFromInitiative = useGameStore((s) => s.removeFromInitiative)
  const addToInitiative = useGameStore((s) => s.addToInitiative)
  const delayTurn = useGameStore((s) => s.delayTurn)
  const undelay = useGameStore((s) => s.undelay)
  const requestCenterOnEntity = useGameStore((s) => s.requestCenterOnEntity)
  const combatTimer = useGameStore((s) => s.combatTimer)
  const setCombatTimer = useGameStore((s) => s.setCombatTimer)

  if (!initiative) return <></>

  const visibleEntries = initiative.entries.slice(Math.max(0, initiative.currentIndex - 1), initiative.currentIndex + 3)

  if (expanded) {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-80">
        <div className="bg-gray-900/70 backdrop-blur-sm border border-gray-700/50 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-amber-400 font-semibold">Round {initiative.round}</span>
            <button
              onClick={() => setExpanded(false)}
              aria-label="Minimize initiative tracker"
              className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
            >
              Minimize
            </button>
          </div>
          <InitiativeTracker
            initiative={initiative}
            round={round}
            isHost={isDM}
            onStartInitiative={startInitiative}
            onNextTurn={nextTurn}
            onPrevTurn={prevTurn}
            onEndInitiative={endInitiative}
            onUpdateEntry={updateInitiativeEntry}
            onRemoveEntry={removeFromInitiative}
            onAddEntry={addToInitiative}
            onDelayTurn={delayTurn}
            onUndelay={undelay}
            onCenterToken={requestCenterOnEntity}
            combatTimer={combatTimer ?? undefined}
            onCombatTimerChange={setCombatTimer}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
      <div
        className="bg-gray-900/70 backdrop-blur-sm border border-gray-700/50 rounded-xl px-3 py-2 cursor-pointer hover:bg-gray-900/80 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-amber-400 font-semibold">R{initiative.round}</span>
          <div className="flex items-center gap-1.5">
            {visibleEntries.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                  entry.isActive ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50' : 'text-gray-400'
                }`}
              >
                <PortraitCircle
                  entry={entry}
                  size="sm"
                  onClick={() => {
                    requestCenterOnEntity(entry.entityId)
                  }}
                />
                <span className="truncate max-w-[60px]">{entry.entityName}</span>
                {isDM && <span className="text-[9px] text-gray-500">{entry.total}</span>}
              </div>
            ))}
          </div>
          {isDM && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  prevTurn()
                }}
                aria-label="Previous turn"
                className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 text-xs cursor-pointer"
              >
                &#9664;
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  nextTurn()
                }}
                aria-label="Next turn"
                className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 text-xs cursor-pointer"
              >
                &#9654;
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  endInitiative()
                }}
                aria-label="End combat"
                className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-gray-700 text-[10px] cursor-pointer"
                title="End Initiative"
              >
                &#10005;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
