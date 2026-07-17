/**
 * Single source of truth for bridge RPC method names and event names, shared by
 * the web-side `window.api` proxy and the native host so the two realms can't
 * drift. RPC methods are the subset of the `window.api` contract that the native
 * shell owns (durable storage + settings); everything else stays in-realm in the
 * WebView (game data fetch, PixiJS, PeerJS).
 */

/** Native-owned RPCs the WebView calls (web → native). */
export const BRIDGE_RPC = {
  // characters
  saveCharacter: 'storage.saveCharacter',
  loadCharacters: 'storage.loadCharacters',
  loadCharacter: 'storage.loadCharacter',
  deleteCharacter: 'storage.deleteCharacter',
  // campaigns
  saveCampaign: 'storage.saveCampaign',
  loadCampaigns: 'storage.loadCampaigns',
  loadCampaign: 'storage.loadCampaign',
  deleteCampaign: 'storage.deleteCampaign',
  // game state
  saveGameState: 'storage.saveGameState',
  loadGameState: 'storage.loadGameState',
  deleteGameState: 'storage.deleteGameState',
  // bans
  loadBans: 'storage.loadBans',
  saveBans: 'storage.saveBans',
  // settings
  loadSettings: 'storage.loadSettings',
  saveSettings: 'storage.saveSettings',
  // misc
  wipeAllData: 'storage.wipeAllData',
  getVersion: 'app.getVersion'
} as const

/**
 * Coordination events. `ui:*` flow web → native; `cmd:*` flow native → web.
 *
 * @public — consumed by the MOBILE project (mobile/src/screens/GameSessionScreen.tsx
 * via its synced `_shared` copy of this file), which is outside the desktop knip
 * graph (`mobile/**` is knip-ignored as a separate npm project). Do NOT delete as
 * "unused"; the tag keeps knip from flagging it. (ISSUES-LOG-DNDAPP 2026-07-17)
 */
export const BRIDGE_EVENT = {
  // web → native (the WebView asks the shell to do something native)
  openCharacterSheet: 'ui:openCharacterSheet',
  sessionEnded: 'ui:sessionEnded',
  navigate: 'ui:navigate',
  // native → web (the shell drives the in-game realm)
  applyHpDelta: 'cmd:applyHpDelta',
  rollDice: 'cmd:rollDice',
  leaveSession: 'cmd:leaveSession'
} as const
