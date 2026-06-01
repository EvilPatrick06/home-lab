import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { useGameStore } from '../../../../stores/use-game-store'
import { FloatingWindow } from '../../../ui'
import { InitiativeTracker } from '../../dm'

interface InitiativeModalProps {
  onClose: () => void
  /** Phase 16c — render inside a non-blocking FloatingWindow instead of a blocking modal. */
  floating?: boolean
  /** Phase 16c — present when the tool can be floated; renders the Float button. */
  onFloat?: () => void
}

export default function InitiativeModal({ onClose, floating, onFloat }: InitiativeModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
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

  const content = (
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
  )

  // Phase 16c — non-blocking floating mode (map stays interactive behind it).
  if (floating) {
    return (
      <FloatingWindow
        storageKey="initiative"
        title={t('game.initiativeModal.title')}
        defaultPosition={{ x: 80, y: 80 }}
        defaultSize={{ width: 360, height: 440 }}
        resizable
        onClose={onClose}
      >
        {content}
      </FloatingWindow>
    )
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} role="presentation" />
      <div className="relative bg-surface/95 backdrop-blur-sm border border-border/50 rounded-xl p-4 max-w-md w-full mx-4 shadow-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-gray-200">{t('game.initiativeModal.title')}</h3>
          <div className="flex items-center gap-2">
            {onFloat && (
              <button
                onClick={onFloat}
                className="text-gray-500 hover:text-amber-300 text-xs cursor-pointer"
                title={t('game.initiativeModal.floatTitle')}
                aria-label={t('game.initiativeModal.floatAria')}
              >
                {t('game.initiativeModal.float')}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
              aria-label={t('common.actions.close')}
            >
              &times;
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{content}</div>
      </div>
    </div>
  )
}
