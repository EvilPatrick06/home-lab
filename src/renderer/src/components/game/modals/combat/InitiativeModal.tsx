import { useGameStore } from '../../../../stores/use-game-store'
import { InitiativeTracker } from '../../dm'

interface InitiativeModalProps {
  onClose: () => void
}

export default function InitiativeModal({ onClose }: InitiativeModalProps): JSX.Element {
  const initiative = useGameStore((s) => s.initiative)
  const round = useGameStore((s) => s.round)
  const startInitiative = useGameStore((s) => s.startInitiative)
  const nextTurn = useGameStore((s) => s.nextTurn)
  const prevTurn = useGameStore((s) => s.prevTurn)
  const endInitiative = useGameStore((s) => s.endInitiative)
  const updateInitiativeEntry = useGameStore((s) => s.updateInitiativeEntry)
  const removeFromInitiative = useGameStore((s) => s.removeFromInitiative)
  const delayTurn = useGameStore((s) => s.delayTurn)
  const undelay = useGameStore((s) => s.undelay)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const maps = useGameStore((s) => s.maps)
  const activeMap = maps.find((m) => m.id === activeMapId) ?? null
  const requestCenterOnEntity = useGameStore((s) => s.requestCenterOnEntity)
  const combatTimer = useGameStore((s) => s.combatTimer)
  const setCombatTimer = useGameStore((s) => s.setCombatTimer)

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-md w-full mx-4 shadow-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200">Initiative Tracker</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <InitiativeTracker
            initiative={initiative}
            round={round}
            isHost={true}
            onStartInitiative={startInitiative}
            onNextTurn={nextTurn}
            onPrevTurn={prevTurn}
            onEndInitiative={endInitiative}
            onUpdateEntry={updateInitiativeEntry}
            onRemoveEntry={removeFromInitiative}
            onDelayTurn={delayTurn}
            onUndelay={undelay}
            tokens={activeMap?.tokens ?? []}
            onCenterToken={requestCenterOnEntity}
            combatTimer={combatTimer ?? undefined}
            onCombatTimerChange={setCombatTimer}
          />
        </div>
      </div>
    </div>
  )
}
