import type { NetworkState } from './types'

/**
 * Leaf accessor that late-binds the network store for the lobby store.
 *
 * `use-lobby-store` reads a few pieces of live network state (`localPeerId`,
 * `role`, `peers`, `sendMessage`) at runtime, while `network-store/index.ts`
 * reads/writes lobby player state. Importing one store from the other in both
 * directions forms a hard import cycle. The network side already depends on the
 * lobby store, so this leaf inverts the lobby → network edge: `network-store`
 * registers its `getState` here at module load, and `use-lobby-store` reads
 * through it without statically importing the network store.
 *
 * `./types` declares `NetworkState` and imports only network message types (no
 * store singleton), so this leaf forms no cycle.
 */

type NetworkStateGetter = () => NetworkState

let getter: NetworkStateGetter | null = null

/** Register the network store's `getState`. Called once by `network-store`. */
export function registerNetworkStoreAccessor(fn: NetworkStateGetter): void {
  getter = fn
}

/**
 * Read the current network store state. Throws if the network store has not
 * registered yet (no active session / main process / tests) — callers guard
 * with try/catch and fall back to a non-networked path, matching the prior
 * `useNetworkStore.getState()` behavior on an unhydrated store.
 */
export function getNetworkStoreState(): NetworkState {
  if (!getter) throw new Error('network store accessor not registered')
  return getter()
}
