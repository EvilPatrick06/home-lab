import { create } from 'zustand'

/**
 * Phase R3b — reachability of the Pi's WebRTC signaling server (bmo-peerjs,
 * `host:9000/myapp`), which the P2P transport uses to connect players. The main
 * process probes it on a slow cadence and broadcasts `BMO_SIGNALING_STATUS`;
 * this store mirrors the latest result so settings UI can warn when P2P games
 * would fail to connect.
 *
 * `reachable` semantics:
 *  - `null` + `checkedAt === null` → never probed yet.
 *  - `null` + `checkedAt !== null` → probe not applicable (no LAN/http Pi target,
 *    e.g. the off-LAN tunnel default that doesn't expose :9000).
 *  - `true` / `false` → the live reachability result.
 */
interface SignalingStatusState {
  reachable: boolean | null
  host: string
  checkedAt: number | null
}

export const useSignalingStatusStore = create<SignalingStatusState>(() => ({
  reachable: null,
  host: '',
  checkedAt: null
}))

// Module-level subscription (mirrors registry-client's onBmoResolvedUrl wiring):
// subscribe once at import so the store is live before any component mounts.
if (typeof window !== 'undefined' && window.api?.lan?.onBmoSignalingStatus) {
  window.api.lan.onBmoSignalingStatus(({ reachable, host }) => {
    useSignalingStatusStore.setState({ reachable, host, checkedAt: Date.now() })
  })
}
