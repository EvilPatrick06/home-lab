/**
 * Bootstrap: registers store accessors so modules like game-action-executor can access
 * stores without circular imports. Must run before any code that uses store-accessors.
 */

import { setStoreAccessors } from './store-accessors'
import { useAiDmStore } from './use-ai-dm-store'
import { useGameStore } from './use-game-store'
import { useLobbyStore } from './use-lobby-store'
import { useNetworkStore } from './network-store'

setStoreAccessors({
  getGameStore: () => useGameStore,
  getLobbyStore: () => useLobbyStore,
  getNetworkStore: () => useNetworkStore,
  getAiDmStore: () => useAiDmStore
})
