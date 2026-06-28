/**
 * Native side of the bridge: constructs a BridgeEndpoint over a WebView and
 * registers the host RPC handlers backed by the on-device SQLite store. This is
 * the native `window.api` host implementation — the WebView's `window.api`
 * proxy calls these methods, the shell answers them.
 *
 * Desktop-only capabilities (auto-updater, Ollama lifecycle, LAN/mDNS) have no
 * meaning on a phone and are intentionally NOT registered here; the embedded
 * renderer already hides them behind `isWebBuild()` capability flags, and any
 * stray call rejects with "no handler" rather than hanging.
 */
import Constants from 'expo-constants'
import { BRIDGE_RPC, BridgeEndpoint } from '@shared/bridge'
import * as store from '@app/storage/storage-adapter'

type Json = Record<string, unknown>

export interface NativeBridge {
  endpoint: BridgeEndpoint
  /** Feed an inbound frame string received from the WebView's onMessage. */
  receive: (data: string) => void
  dispose: () => void
}

/**
 * @param send  Pushes a frame string into the WebView realm (see GameSessionScreen).
 */
export function createNativeBridge(send: (data: string) => void): NativeBridge {
  const endpoint = new BridgeEndpoint({
    role: 'native',
    send,
    onError: (err) => console.warn('[bridge:native]', err.message)
  })

  const asString = (v: unknown): string => String(v)
  const asJson = (v: unknown): Json => (v ?? {}) as Json

  endpoint.handleAll({
    // ── characters ──
    [BRIDGE_RPC.saveCharacter]: async (c) => {
      const character = asJson(c)
      await store.put('characters', asString(character.id), character)
      return { success: true }
    },
    [BRIDGE_RPC.loadCharacters]: () => store.list('characters'),
    [BRIDGE_RPC.loadCharacter]: (id) => store.get('characters', asString(id)),
    [BRIDGE_RPC.deleteCharacter]: (id) => store.remove('characters', asString(id)),

    // ── campaigns ──
    [BRIDGE_RPC.saveCampaign]: async (c) => {
      const campaign = asJson(c)
      await store.put('campaigns', asString(campaign.id), campaign)
      return { success: true }
    },
    [BRIDGE_RPC.loadCampaigns]: () => store.list('campaigns'),
    [BRIDGE_RPC.loadCampaign]: (id) => store.get('campaigns', asString(id)),
    [BRIDGE_RPC.deleteCampaign]: (id) => store.remove('campaigns', asString(id)),

    // ── game state (keyed by campaignId) ──
    [BRIDGE_RPC.saveGameState]: async (campaignId, state) => {
      await store.put('gameState', asString(campaignId), asJson(state))
      return { success: true }
    },
    [BRIDGE_RPC.loadGameState]: (campaignId) => store.get('gameState', asString(campaignId)),
    [BRIDGE_RPC.deleteGameState]: (campaignId) => store.remove('gameState', asString(campaignId)),

    // ── bans (keyed by campaignId) ──
    [BRIDGE_RPC.loadBans]: async (campaignId) => {
      const data = await store.get('bans', asString(campaignId))
      return data ?? { peerIds: [], names: [], clients: [] }
    },
    [BRIDGE_RPC.saveBans]: async (campaignId, banData) => {
      await store.put('bans', asString(campaignId), asJson(banData))
      return { success: true }
    },

    // ── settings (singleton) ──
    [BRIDGE_RPC.loadSettings]: () => store.loadSettings(),
    [BRIDGE_RPC.saveSettings]: async (settings) => {
      await store.saveSettings(asJson(settings))
      return { success: true }
    },

    // ── misc ──
    [BRIDGE_RPC.wipeAllData]: async () => {
      const removed = await store.wipeAll()
      return { success: true, removed }
    },
    [BRIDGE_RPC.getVersion]: () => Constants.expoConfig?.version ?? 'dev'
  })

  endpoint.hello()

  return {
    endpoint,
    receive: (data) => endpoint.receive(data),
    dispose: () => endpoint.dispose()
  }
}
