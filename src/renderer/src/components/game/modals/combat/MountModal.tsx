import { useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import NarrowModalShell from '../shared/NarrowModalShell'

interface MountModalProps {
  isOpen: boolean
  onClose: () => void
  riderId: string
  mountId?: string
  mapId: string
}

/**
 * Modal for mounting/dismounting during combat.
 *
 * - Mount action: DM selects a target token (the mount), picks controlled vs
 *   independent, then clicks "Mount" to link rider and mount.
 * - Dismount action: Clears riderId from the mount token and mountedOn/mountType
 *   from the rider's turn state.
 */
export default function MountModal({ isOpen, onClose, riderId, mountId, mapId }: MountModalProps): JSX.Element | null {
  if (!isOpen) return null

  const maps = useGameStore((s) => s.maps)
  const updateToken = useGameStore((s) => s.updateToken)
  const turnStates = useGameStore((s) => s.turnStates)

  const map = maps.find((m) => m.id === mapId)
  const tokens = map?.tokens ?? []

  // Find the rider token
  const riderToken = tokens.find((t) => t.entityId === riderId)

  // Determine whether already mounted
  const riderTurnState = turnStates[riderId]
  const isCurrentlyMounted = !!riderTurnState?.mountedOn || !!mountId

  // Resolve the current mount token (from prop or turn state)
  const currentMountTokenId = mountId ?? riderTurnState?.mountedOn
  const currentMountToken = currentMountTokenId ? tokens.find((t) => t.id === currentMountTokenId) : undefined

  // State for mount selection (when not already mounted)
  const [selectedMountId, setSelectedMountId] = useState<string | null>(null)
  const [mountType, setMountType] = useState<'controlled' | 'independent'>('controlled')

  // Eligible mounts: tokens that are not the rider, have no current rider, and
  // are at least Large size (sizeX >= 2 for Large or bigger).
  const eligibleMounts = tokens.filter(
    (t) =>
      t.entityId !== riderId &&
      !t.riderId &&
      Math.max(t.sizeX, t.sizeY) >= 2 &&
      (t.currentHP === undefined || t.currentHP > 0)
  )

  const selectedMount = selectedMountId ? tokens.find((t) => t.id === selectedMountId) : null

  // ── Mount handler ──
  const handleMount = (): void => {
    if (!selectedMount || !riderToken) return

    // Set riderId on the mount token
    updateToken(mapId, selectedMount.id, { riderId })

    // Update rider's turn state with mountedOn + mountType
    const state = useGameStore.getState()
    const existingTurnState = state.turnStates[riderId]
    if (existingTurnState) {
      useGameStore.setState({
        turnStates: {
          ...state.turnStates,
          [riderId]: {
            ...existingTurnState,
            mountedOn: selectedMount.id,
            mountType
          }
        }
      })
    }

    onClose()
  }

  // ── Dismount handler ──
  const handleDismount = (): void => {
    if (!currentMountToken) return

    // Clear riderId on the mount token
    updateToken(mapId, currentMountToken.id, { riderId: undefined })

    // Clear mountedOn + mountType from rider's turn state
    const state = useGameStore.getState()
    const existingTurnState = state.turnStates[riderId]
    if (existingTurnState) {
      useGameStore.setState({
        turnStates: {
          ...state.turnStates,
          [riderId]: {
            ...existingTurnState,
            mountedOn: undefined,
            mountType: undefined
          }
        }
      })
    }

    onClose()
  }

  return (
    <NarrowModalShell title="Mounted Combat" onClose={onClose}>
      {/* Rider info */}
      <div className="mb-3">
        <span className="text-xs text-gray-400">Rider:</span>
        <div className="text-sm text-gray-200 font-medium mt-0.5">{riderToken?.label ?? riderId}</div>
      </div>

      {isCurrentlyMounted && currentMountToken ? (
        /* ── Already mounted: show dismount controls ── */
        <div>
          <div className="mb-3">
            <span className="text-xs text-gray-400">Currently mounted on:</span>
            <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
              <span className="text-sm text-gray-200 font-medium">{currentMountToken.label}</span>
              {currentMountToken.walkSpeed != null && (
                <span className="text-xs text-gray-500">({currentMountToken.walkSpeed} ft)</span>
              )}
              <span className="ml-auto text-xs text-amber-400">
                {riderTurnState?.mountType === 'independent' ? 'Independent' : 'Controlled'}
              </span>
            </div>
          </div>

          <button
            onClick={handleDismount}
            className="w-full px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
          >
            Dismount
          </button>

          <div className="text-[10px] text-gray-600 mt-2">
            Dismounting uses half your movement speed. If the mount is killed, you must make a DC 10 Dex save or fall
            Prone.
          </div>
        </div>
      ) : (
        /* ── Not mounted: show mount selection ── */
        <div>
          {/* Mount type selector */}
          <div className="mb-3">
            <span className="text-xs text-gray-400">Mount Type:</span>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setMountType('controlled')}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                  mountType === 'controlled'
                    ? 'bg-blue-900/40 border-blue-500 text-blue-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <div className="font-semibold">Controlled</div>
                <div className="text-[10px] mt-0.5 opacity-70">Mount can only Dash, Disengage, or Dodge</div>
              </button>
              <button
                onClick={() => setMountType('independent')}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                  mountType === 'independent'
                    ? 'bg-purple-900/40 border-purple-500 text-purple-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <div className="font-semibold">Independent</div>
                <div className="text-[10px] mt-0.5 opacity-70">Mount acts on its own initiative</div>
              </button>
            </div>
          </div>

          {/* Mount selection */}
          <div className="mb-4">
            <span className="text-xs text-gray-400">Select Mount:</span>
            {eligibleMounts.length === 0 ? (
              <div className="mt-1 text-xs text-gray-500 italic">
                No eligible mounts nearby (must be Large or bigger with no current rider).
              </div>
            ) : (
              <div className="space-y-1 mt-1 max-h-40 overflow-y-auto">
                {eligibleMounts.map((token) => (
                  <button
                    key={token.id}
                    onClick={() => setSelectedMountId(token.id)}
                    className={`w-full text-left px-3 py-2 border rounded-lg cursor-pointer ${
                      selectedMountId === token.id
                        ? 'bg-amber-900/30 border-amber-500'
                        : 'bg-gray-800 hover:bg-gray-700 border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-200">{token.label}</span>
                      <div className="flex gap-2 text-xs text-gray-500">
                        {token.walkSpeed != null && <span>{token.walkSpeed} ft</span>}
                        {token.currentHP != null && (
                          <span>
                            HP: {token.currentHP}/{token.maxHP}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleMount}
            disabled={!selectedMount}
            className="w-full px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mount{selectedMount ? ` ${selectedMount.label}` : ''}
          </button>

          <div className="text-[10px] text-gray-600 mt-2">
            Mounting costs half your movement. Controlled mounts can only Dash, Disengage, or Dodge. Independent mounts
            act on their own turn.
          </div>
        </div>
      )}
    </NarrowModalShell>
  )
}
