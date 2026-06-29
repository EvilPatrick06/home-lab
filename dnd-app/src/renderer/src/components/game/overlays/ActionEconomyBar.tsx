import { useT } from '../../../i18n'
import { useGameStore } from '../../../stores/use-game-store'

interface ActionEconomyBarProps {
  entityId: string
  entityName: string
  isDM: boolean
  isMyTurn: boolean
  onEndTurn: () => void
}

function MovementSlot({ remaining, max }: { remaining: number; max: number }): JSX.Element {
  const { t } = useT()
  const pct = max > 0 ? remaining / max : 0
  const color = pct > 0.5 ? 'text-green-400' : pct > 0 ? 'text-accent' : 'text-red-400'
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2/60">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{t('game.actionEconomyBar.move')}</span>
      <span className={`text-xs font-bold ${color}`}>{t('game.actionEconomyBar.feet', { remaining, max })}</span>
    </div>
  )
}

function ResourceDot({
  label,
  used,
  availableColor,
  statusLabel,
  onClick
}: {
  label: string
  used: boolean
  availableColor: string
  statusLabel?: string
  onClick?: () => void
}): JSX.Element {
  const { t } = useT()
  const dotColor = used ? 'bg-gray-600' : availableColor
  const textColor = used ? 'text-gray-500' : 'text-gray-300'
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-label={
        used ? t('game.actionEconomyBar.usedResource', { label }) : t('game.actionEconomyBar.useResource', { label })
      }
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2/60 ${onClick ? 'cursor-pointer hover:bg-gray-700/60' : 'cursor-default'}`}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
      <span className={`text-xs uppercase tracking-wider ${textColor}`}>{statusLabel ?? label}</span>
    </button>
  )
}

export default function ActionEconomyBar({
  entityId,
  entityName,
  isDM,
  isMyTurn,
  onEndTurn
}: ActionEconomyBarProps): JSX.Element {
  const { t } = useT()
  const turnState = useGameStore((s) => s.turnStates[entityId])
  const useAction = useGameStore((s) => s.useAction)
  const useBonusAction = useGameStore((s) => s.useBonusAction)
  const useReaction = useGameStore((s) => s.useReaction)
  const useFreeInteraction = useGameStore((s) => s.useFreeInteraction)

  const maps = useGameStore((s) => s.maps)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const isMounted = !!turnState?.mountedOn
  const mountToken = isMounted
    ? maps.find((m) => m.id === activeMapId)?.tokens.find((t) => t.id === turnState?.mountedOn)
    : null
  const mountSpeed = mountToken?.walkSpeed ?? 0

  const movementRemaining = turnState?.movementRemaining ?? 30
  const movementMax = turnState?.movementMax ?? 30
  const actionUsed = turnState?.actionUsed ?? false
  const bonusActionUsed = turnState?.bonusActionUsed ?? false
  const reactionUsed = turnState?.reactionUsed ?? false
  const freeInteractionUsed = turnState?.freeInteractionUsed ?? false

  // Show special status on action if dash/disengage/dodge is active
  const actionStatusLabel = turnState?.isDashing
    ? t('game.actionEconomyBar.dash')
    : turnState?.isDisengaging
      ? t('game.actionEconomyBar.disengage')
      : turnState?.isDodging
        ? t('game.actionEconomyBar.dodge')
        : undefined

  return (
    <div
      className="absolute top-14 start-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-surface/80 backdrop-blur-sm border border-border/50 rounded-xl shadow-lg"
      role="status"
      aria-label={t('game.actionEconomyBar.turnResources', { entityName })}
    >
      <span className="text-xs text-gray-500 font-semibold me-1 max-w-[80px] truncate" title={entityName}>
        {entityName}
      </span>

      <MovementSlot remaining={movementRemaining} max={movementMax} />

      {isMounted && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-900/40 border border-emerald-700/30">
          <span className="text-xs text-emerald-400 font-semibold">{t('game.actionEconomyBar.mounted')}</span>
          {mountSpeed > 0 && (
            <span className="text-xs text-emerald-300">
              {t('game.actionEconomyBar.speedFeet', { speed: mountSpeed })}
            </span>
          )}
        </div>
      )}

      <ResourceDot
        label={t('game.actionEconomyBar.action')}
        used={actionUsed}
        availableColor="bg-green-500"
        statusLabel={actionStatusLabel}
        onClick={isDM ? () => useAction(entityId) : undefined}
      />

      <ResourceDot
        label={t('game.actionEconomyBar.bonus')}
        used={bonusActionUsed}
        availableColor="bg-blue-500"
        onClick={isDM ? () => useBonusAction(entityId) : undefined}
      />

      <ResourceDot
        label={t('game.actionEconomyBar.reaction')}
        used={reactionUsed}
        availableColor="bg-yellow-500"
        onClick={isDM ? () => useReaction(entityId) : undefined}
      />

      <ResourceDot
        label={t('game.actionEconomyBar.object')}
        used={freeInteractionUsed}
        availableColor="bg-purple-500"
        onClick={isDM ? () => useFreeInteraction(entityId) : undefined}
      />

      {isMyTurn && (
        <button
          onClick={onEndTurn}
          aria-label={t('game.actionEconomyBar.endTurnAria')}
          className="ms-1 px-3 py-1 text-xs font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded-lg cursor-pointer transition-colors"
        >
          {t('game.actionEconomyBar.endTurn')}
        </button>
      )}
    </div>
  )
}
