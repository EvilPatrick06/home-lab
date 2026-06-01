/**
 * Leaf module holding a synchronous mirror of the active campaign id.
 *
 * `use-config-store` needs to read the active campaign id (to scope campaign-only
 * homebrew in {@link mergeHomebrew}) and `use-campaign-store` needs to call
 * `useConfigStore.clearAll()` on campaign deletion. Importing one store from the
 * other (in either direction) creates a module import cycle that the circular
 * dependency check (dpdm) flags even when one edge is a dynamic `import()`.
 *
 * This module imports neither store, so both can depend on it without a cycle.
 * `use-campaign-store` writes the active id here whenever it changes; the config
 * store reads it synchronously. A missing/unset value falls back to `null`
 * ("global homebrew only"), matching the prior unhydrated-store behavior.
 */

let activeCampaignId: string | null = null

/** Update the mirrored active campaign id. Called by `use-campaign-store`. */
export function setActiveCampaignIdRef(id: string | null): void {
  activeCampaignId = id
}

/** Read the mirrored active campaign id. Returns `null` when none is active. */
export function getActiveCampaignId(): string | null {
  return activeCampaignId
}
