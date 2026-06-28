/**
 * Builds the embed `window.api` by taking the standard browser shim
 * (`createWebApi`) and OVERRIDING the storage + settings + version surface to
 * route over the bridge to the native shell, which owns durable data. Everything
 * else (bundled 5e game data via fetch, Pi-backed library/registry/AI, PeerJS)
 * stays in-realm and keeps the web-shim implementation unchanged.
 *
 * This is the third `window.api` transport described in the architecture: same
 * contract as the Electron preload and the web shim, different backend.
 */
import { BRIDGE_RPC, type BridgeEndpoint } from '../shared/bridge'

export function createBridgeApi(endpoint: BridgeEndpoint, base: Window['api']): Window['api'] {
  const call = <T>(method: string, ...args: unknown[]): Promise<T> => endpoint.call<T>(method, ...args)

  const overrides = {
    // characters
    saveCharacter: (c: Record<string, unknown>) => call<{ success: boolean }>(BRIDGE_RPC.saveCharacter, c),
    loadCharacters: () => call<Record<string, unknown>[]>(BRIDGE_RPC.loadCharacters),
    loadCharacter: (id: string) => call<Record<string, unknown> | null>(BRIDGE_RPC.loadCharacter, id),
    deleteCharacter: (id: string) => call<boolean>(BRIDGE_RPC.deleteCharacter, id),
    // campaigns
    saveCampaign: (c: Record<string, unknown>) => call<{ success: boolean }>(BRIDGE_RPC.saveCampaign, c),
    loadCampaigns: () => call<Record<string, unknown>[]>(BRIDGE_RPC.loadCampaigns),
    loadCampaign: (id: string) => call<Record<string, unknown> | null>(BRIDGE_RPC.loadCampaign, id),
    deleteCampaign: (id: string) => call<boolean>(BRIDGE_RPC.deleteCampaign, id),
    // game state
    saveGameState: (campaignId: string, state: Record<string, unknown>) =>
      call<{ success: boolean }>(BRIDGE_RPC.saveGameState, campaignId, state),
    loadGameState: (campaignId: string) => call<Record<string, unknown> | null>(BRIDGE_RPC.loadGameState, campaignId),
    deleteGameState: (campaignId: string) => call<boolean>(BRIDGE_RPC.deleteGameState, campaignId),
    // bans
    loadBans: (campaignId: string) => call(BRIDGE_RPC.loadBans, campaignId),
    saveBans: (campaignId: string, banData: unknown) =>
      call<{ success: boolean }>(BRIDGE_RPC.saveBans, campaignId, banData),
    // settings
    loadSettings: () => call(BRIDGE_RPC.loadSettings),
    saveSettings: (settings: unknown) => call<{ success: boolean }>(BRIDGE_RPC.saveSettings, settings),
    // misc
    wipeAllData: () => call<{ success: boolean; removed?: string[] }>(BRIDGE_RPC.wipeAllData),
    getVersion: () => call<string>(BRIDGE_RPC.getVersion)
  }

  return { ...base, ...overrides } as Window['api']
}
