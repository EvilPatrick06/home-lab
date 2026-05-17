import { useNetworkStore } from '../../stores/network-store'
import { useLobbyStore } from '../../stores/use-lobby-store'

/**
 * Phase 29d — Color confirmation gate.
 *
 * The Ready button stays locked until the local player has explicitly
 * confirmed their avatar border color via this button. Picking a color in
 * `PlayerCard` only updates the local UI optimistically; clicking Confirm
 * sends `player:color-confirm` to the host, which validates uniqueness and
 * either echoes back an authoritative `player:color-change` (flipping
 * `colorConfirmed = true`) or returns `player:color-rejected` (which the
 * client handler reverts).
 *
 * Disabled when:
 *   - no local color is set yet
 *   - the local color is already held by another peer (would just trigger a
 *     rejection round-trip — surface the conflict in the UI instead)
 *   - the color is already confirmed (no-op)
 */
export default function ColorConfirmButton(): JSX.Element | null {
  const players = useLobbyStore((s) => s.players)
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const sendMessage = useNetworkStore((s) => s.sendMessage)

  const localPlayer = players.find((p) => p.peerId === localPeerId)
  if (!localPlayer) return null

  const localColor = localPlayer.color
  const isConfirmed = localPlayer.colorConfirmed === true

  // Colors held by *other* peers (excluding self).
  const usedByOthers = new Set(players.filter((p) => p.peerId !== localPeerId && p.color).map((p) => p.color!))
  const isTaken = !!(localColor && usedByOthers.has(localColor))

  const disabled = !localColor || isTaken || isConfirmed

  const handleConfirm = (): void => {
    if (disabled || !localColor) return
    sendMessage('player:color-confirm', { color: localColor })
  }

  const label = isConfirmed
    ? 'Color Confirmed'
    : isTaken
      ? 'Color Taken — Pick Another'
      : !localColor
        ? 'Pick a Color First'
        : 'Confirm Color'

  return (
    <button
      type="button"
      aria-label={label}
      onClick={handleConfirm}
      disabled={disabled}
      className={`w-full py-2 rounded-lg font-medium text-sm transition-all
        ${
          isConfirmed
            ? 'bg-amber-600/30 border border-amber-600 text-amber-300 cursor-default'
            : isTaken
              ? 'bg-red-900/30 border border-red-700 text-red-300 cursor-not-allowed'
              : !localColor
                ? 'bg-transparent border border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-transparent border-2 border-amber-600 text-amber-400 hover:bg-amber-900/20 cursor-pointer'
        }
        disabled:opacity-80`}
    >
      {label}
    </button>
  )
}
