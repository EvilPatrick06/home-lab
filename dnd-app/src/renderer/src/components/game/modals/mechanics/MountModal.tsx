import { useState } from 'react'
import { getTokenSizeCategory, isAdjacent } from '../../../../services/combat/combat-rules'
import { useGameStore } from '../../../../stores/use-game-store'
import type { Character } from '../../../../types/character'
import type { MapToken } from '../../../../types/map'

interface MountModalProps {
  character: Character | null
  tokens: MapToken[]
  attackerToken: MapToken | null
  onClose: () => void
  onBroadcastResult?: (message: string) => void
}

export default function MountModal({
  character,
  tokens,
  attackerToken,
  onClose,
  onBroadcastResult
}: MountModalProps): JSX.Element {
  const turnStates = useGameStore((s) => s.turnStates)
  const updateToken = useGameStore((s) => s.updateToken)
  const activeMapId = useGameStore((s) => s.activeMapId)
  const maps = useGameStore((s) => s.maps)
  const [selectedMountType, setSelectedMountType] = useState<Record<string, 'controlled' | 'independent'>>({})

  if (!character || !attackerToken) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-6 text-center">
          <p className="text-gray-400">No character selected</p>
          <button onClick={onClose} className="mt-3 px-4 py-1 text-sm bg-gray-700 rounded cursor-pointer">
            Close
          </button>
        </div>
      </div>
    )
  }

  const ts = turnStates[character.id]
  const isMounted = !!ts?.mountedOn
  const mountSpeed = Math.floor((ts?.movementMax ?? 30) / 2)

  // Find the mount token if mounted
  const activeMap = maps.find((m) => m.id === activeMapId)
  const mountToken = isMounted && activeMap ? activeMap.tokens.find((t) => t.id === ts.mountedOn) : null

  const handleDismount = (): void => {
    if (!ts || !activeMap) return

    // Deduct half speed
    const gameStore = useGameStore.getState()
    if (ts.movementRemaining < mountSpeed) {
      // Not enough movement
      return
    }
    gameStore.useMovement(character.id, mountSpeed)

    // Clear mount state from turn state
    gameStore.resetTurnState(character.id, ts.movementMax)
    const updatedTs = gameStore.turnStates[character.id]
    if (updatedTs) {
      // Manually update to preserve current movement minus cost and clear mount
      const newRemaining = ts.movementRemaining - mountSpeed
      const newState = {
        ...updatedTs,
        movementRemaining: newRemaining,
        mountedOn: undefined,
        mountType: undefined
      }
      // We need to set the turnState directly
      useGameStore.setState((s) => ({
        turnStates: { ...s.turnStates, [character.id]: newState }
      }))
    }

    // Clear riderId from mount token
    if (mountToken) {
      updateToken(activeMap.id, mountToken.id, { riderId: undefined })
    }

    onBroadcastResult?.(
      `${character.name} dismounts from ${mountToken?.label ?? 'mount'} (costs ${mountSpeed} ft of movement)`
    )
    onClose()
  }

  const handleMount = (targetToken: MapToken): void => {
    if (!ts || !activeMap) return

    const mountType = selectedMountType[targetToken.id] ?? 'controlled'

    // Deduct half speed
    if (ts.movementRemaining < mountSpeed) return

    const gameStore = useGameStore.getState()
    gameStore.useMovement(character.id, mountSpeed)

    // Set mount state on turn state
    useGameStore.setState((s) => ({
      turnStates: {
        ...s.turnStates,
        [character.id]: {
          ...s.turnStates[character.id],
          mountedOn: targetToken.id,
          mountType
        }
      }
    }))

    // Set riderId on mount token
    updateToken(activeMap.id, targetToken.id, { riderId: character.id })

    onBroadcastResult?.(
      `${character.name} mounts ${targetToken.label} (${mountType}, costs ${mountSpeed} ft of movement)`
    )
    onClose()
  }

  // Find adjacent tokens that are at least 1 size category larger
  const attackerSize = getTokenSizeCategory(attackerToken)
  const mountCandidates = tokens.filter((t) => {
    if (t.id === attackerToken.id) return false
    if (t.riderId) return false // Already has a rider
    if (!isAdjacent(attackerToken, t)) return false
    return getTokenSizeCategory(t) > attackerSize
  })

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[400px] max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">{isMounted ? 'Mounted Combat' : 'Mount / Dismount'}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {isMounted && mountToken ? (
          /* Currently mounted */
          <div className="space-y-3">
            <div className="p-3 bg-gray-800 rounded-lg border border-green-700/50">
              <div className="text-xs text-gray-400 mb-1">Currently mounted on:</div>
              <div className="text-sm font-semibold text-green-400">{mountToken.label}</div>
              <div className="text-[10px] text-gray-500 mt-1">
                Type:{' '}
                <span className="text-amber-400">{ts.mountType === 'controlled' ? 'Controlled' : 'Independent'}</span>
              </div>
              {ts.mountType === 'controlled' && (
                <div className="text-[10px] text-gray-500 mt-0.5">Mount can only: Dash, Disengage, Dodge</div>
              )}
            </div>

            <button
              onClick={handleDismount}
              disabled={(ts?.movementRemaining ?? 0) < mountSpeed}
              className="w-full px-4 py-3 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Dismount ({mountSpeed} ft of movement)
            </button>
            {(ts?.movementRemaining ?? 0) < mountSpeed && (
              <div className="text-[10px] text-red-400 text-center">Not enough movement remaining</div>
            )}
          </div>
        ) : (
          /* Not mounted - show candidates */
          <div className="space-y-3">
            {mountCandidates.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No valid mounts nearby. Must be adjacent and at least 1 size larger.
              </div>
            ) : (
              <div className="space-y-2">
                {mountCandidates.map((token) => {
                  const sizeNames = ['Tiny/Small/Med', 'Large', 'Huge', 'Gargantuan']
                  const sizeIdx = Math.min(getTokenSizeCategory(token) - 1, sizeNames.length - 1)
                  const mt = selectedMountType[token.id] ?? 'controlled'
                  return (
                    <div key={token.id} className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm text-gray-200">{token.label}</span>
                          <span className="text-[10px] text-gray-500 ml-2">({sizeNames[sizeIdx]})</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <button
                          onClick={() => setSelectedMountType((s) => ({ ...s, [token.id]: 'controlled' }))}
                          className={`flex-1 px-2 py-1 text-[10px] rounded cursor-pointer ${
                            mt === 'controlled'
                              ? 'bg-amber-600 text-white'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          Controlled
                        </button>
                        <button
                          onClick={() => setSelectedMountType((s) => ({ ...s, [token.id]: 'independent' }))}
                          className={`flex-1 px-2 py-1 text-[10px] rounded cursor-pointer ${
                            mt === 'independent'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          Independent
                        </button>
                      </div>
                      <button
                        onClick={() => handleMount(token)}
                        disabled={(ts?.movementRemaining ?? 0) < mountSpeed}
                        className="w-full px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-xs font-semibold rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Mount ({mountSpeed} ft)
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {(ts?.movementRemaining ?? 0) < mountSpeed && mountCandidates.length > 0 && (
              <div className="text-[10px] text-red-400 text-center">
                Not enough movement remaining ({mountSpeed} ft needed)
              </div>
            )}
          </div>
        )}

        {/* Rules summary */}
        <div className="mt-4 border-t border-gray-700 pt-3 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Mounted Combat Rules</div>
          <div className="text-[10px] text-gray-500">Mounting/dismounting costs half your speed</div>
          <div className="text-[10px] text-gray-500">Controlled mount: Can only Dash, Disengage, or Dodge</div>
          <div className="text-[10px] text-gray-500">Independent mount: Acts on its own initiative turn</div>
          <div className="text-[10px] text-gray-500">Mount must be at least 1 size larger than rider</div>
        </div>
      </div>
    </div>
  )
}
