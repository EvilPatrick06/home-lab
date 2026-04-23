/**
 * Leaf module: lazy store accessors for modules that cannot import stores directly
 * due to circular dependencies. Populated at app bootstrap.
 */

type GameStore = typeof import('./use-game-store').useGameStore
type LobbyStore = typeof import('./use-lobby-store').useLobbyStore
type NetworkStore = typeof import('./use-network-store').useNetworkStore
type AiDmStore = typeof import('./use-ai-dm-store').useAiDmStore

let _getGameStore: (() => GameStore) | null = null
let _getLobbyStore: (() => LobbyStore) | null = null
let _getNetworkStore: (() => NetworkStore) | null = null
let _getAiDmStore: (() => AiDmStore) | null = null

export interface StoreAccessorsConfig {
  getGameStore: () => GameStore
  getLobbyStore: () => LobbyStore
  getNetworkStore: () => NetworkStore
  getAiDmStore: () => AiDmStore
}

export function setStoreAccessors(cfg: StoreAccessorsConfig): void {
  _getGameStore = cfg.getGameStore
  _getLobbyStore = cfg.getLobbyStore
  _getNetworkStore = cfg.getNetworkStore
  _getAiDmStore = cfg.getAiDmStore
}

export function getGameStore(): GameStore {
  if (!_getGameStore) throw new Error('Store accessors not initialized')
  return _getGameStore()
}

export function getLobbyStore(): LobbyStore {
  if (!_getLobbyStore) throw new Error('Store accessors not initialized')
  return _getLobbyStore()
}

export function getNetworkStore(): NetworkStore {
  if (!_getNetworkStore) throw new Error('Store accessors not initialized')
  return _getNetworkStore()
}

export function getAiDmStore(): AiDmStore {
  if (!_getAiDmStore) throw new Error('Store accessors not initialized')
  return _getAiDmStore()
}
