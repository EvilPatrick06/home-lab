import { useGameStore } from '../../../stores/use-game-store'

interface ActionEconomyBarProps {
  entityId: string
  entityName: string
  isDM: boolean
  isMyTurn: boolean
  onEndTurn: () => void
}

function MovementSlot({ remaining, max }: { remaining: number; max: number }): JSX.Element {
  const pct = max > 0 ? remaining / max : 0
  const color = pct > 0.5 ? 'text-green-400' : pct > 0 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/60">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Move</span>
      <span className={`text-xs font-bold ${color}`}>
        {remaining}/{max} ft
      </span>
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
  const dotColor = used ? 'bg-gray-600' : availableColor
  const textColor = used ? 'text-gray-500' : 'text-gray-300'
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${used ? 'Used' : 'Use'} ${label}`}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/60 ${onClick ? 'cursor-pointer hover:bg-gray-700/60' : 'cursor-default'}`}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
      <span className={`text-[10px] uppercase tracking-wider ${textColor}`}>{statusLabel ?? label}</span>
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
    ? 'Dash'
    : turnState?.isDisengaging
      ? 'Disengage'
      : turnState?.isDodging
        ? 'Dodge'
        : undefined

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-lg">
      <span className="text-[10px] text-gray-500 font-semibold mr-1 max-w-[80px] truncate" title={entityName}>
        {entityName}
      </span>

      <MovementSlot remaining={movementRemaining} max={movementMax} />

      {isMounted && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-900/40 border border-emerald-700/30">
          <span className="text-[10px] text-emerald-400 font-semibold">(Mounted)</span>
          {mountSpeed > 0 && <span className="text-[10px] text-emerald-300">{mountSpeed} ft</span>}
        </div>
      )}

      <ResourceDot
        label="Action"
        used={actionUsed}
        availableColor="bg-green-500"
        statusLabel={actionStatusLabel}
        onClick={isDM ? () => useAction(entityId) : undefined}
      />

      <ResourceDot
        label="Bonus"
        used={bonusActionUsed}
        availableColor="bg-blue-500"
        onClick={isDM ? () => useBonusAction(entityId) : undefined}
      />

      <ResourceDot
        label="Reaction"
        used={reactionUsed}
        availableColor="bg-yellow-500"
        onClick={isDM ? () => useReaction(entityId) : undefined}
      />

      <ResourceDot
        label="Object"
        used={freeInteractionUsed}
        availableColor="bg-purple-500"
        onClick={isDM ? () => useFreeInteraction(entityId) : undefined}
      />

      {isMyTurn && (
        <button
          onClick={onEndTurn}
          aria-label="End turn"
          className="ml-1 px-3 py-1 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-lg cursor-pointer transition-colors"
        >
          End Turn
        </button>
      )}
    </div>
  )
}
