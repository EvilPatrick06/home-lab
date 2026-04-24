/**
 * Shared types for game-action sub-modules.
 */

export interface DmAction {
  action: string
  [key: string]: unknown
}

export interface ExecutionFailure {
  action: DmAction
  reason: string
}

export interface ExecutionResult {
  executed: DmAction[]
  failed: ExecutionFailure[]
}

/**
 * Lazy store accessor functions passed to sub-modules so they don't
 * import stores directly.
 */
export interface StoreAccessors {
  getGameStore: () => typeof import('../../stores/use-game-store').useGameStore
  getLobbyStore: () => typeof import('../../stores/use-lobby-store').useLobbyStore
  getNetworkStore: () => typeof import('../../stores/use-network-store').useNetworkStore
}

export type GameStoreState = ReturnType<StoreAccessors['getGameStore']>
export type GameStoreSnapshot = ReturnType<GameStoreState['getState']>
export type ActiveMap = GameStoreSnapshot['maps'][number] | undefined
