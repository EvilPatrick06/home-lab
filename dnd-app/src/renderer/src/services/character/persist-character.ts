import { useNetworkStore } from '../../stores/network-store'
import { useCharacterStore } from '../../stores/use-character-store'
import type { Character } from '../../types/character'

/**
 * CH-2b — persist a character to the LOCAL library ONLY when this client owns it.
 *
 * A DM editing a player's PC resolves that PC from `useLobbyStore.remoteCharacters`
 * (it is absent from the DM's own library) and the PC is stamped with the owning
 * peer's id (`playerId !== 'local'`, see `host-handlers`/`useCharacterSelectBridge`).
 * Calling `saveCharacter` on it would insert the player's character into the DM's
 * "My Characters" list — a data-integrity leak. The owning player persists the
 * edit on receipt of the `dm:character-update` broadcast instead.
 *
 * The guard mirrors the broadcast gate used across the app
 * (`role === 'host' && playerId !== 'local'`): the host's own characters keep
 * `playerId === 'local'` and are always persisted; everyone else (single-player,
 * a player editing their own sheet) persists unconditionally.
 *
 * @returns `true` when the character was persisted locally, `false` when skipped.
 */
export function persistCharacterIfOwned(character: Character): boolean {
  const { role } = useNetworkStore.getState()
  if (role === 'host' && character.playerId !== 'local') {
    return false
  }
  void useCharacterStore.getState().saveCharacter(character)
  return true
}
