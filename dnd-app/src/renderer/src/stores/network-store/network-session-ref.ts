/**
 * Leaf module mirroring the network store's current `campaignId`.
 *
 * The sync shards need the active network-session campaign id (to resolve the
 * `Campaign` for a per-recipient permission check) but importing
 * `network-store/index.ts` to read `useNetworkStore.getState().campaignId`
 * forms a shard ↔ network-store import cycle (the store imports the shard barrel
 * to register shards at load).
 *
 * This module imports neither the store nor the shards, so both can depend on it.
 * `network-store/index.ts` writes the current value here whenever the store's
 * `campaignId` changes; shards read it synchronously. `null` means no active
 * network session, matching the store's default.
 */

let networkCampaignId: string | null = null

/** Update the mirrored network-session campaign id. Called by `network-store`. */
export function setNetworkCampaignIdRef(id: string | null): void {
  networkCampaignId = id
}

/** Read the mirrored network-session campaign id. Returns `null` when unset. */
export function getNetworkCampaignId(): string | null {
  return networkCampaignId
}
