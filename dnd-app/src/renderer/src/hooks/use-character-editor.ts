import { persistCharacterIfOwned } from '../services/character/persist-character'
import { useNetworkStore } from '../stores/network-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import type { Character } from '../types'

/**
 * Provides common character editing utilities used across sheet sections.
 * Eliminates duplication of get-latest → update → save → broadcast logic.
 */
export function useCharacterEditor(characterId: string) {
  const getLatest = (): Character | undefined =>
    useCharacterStore.getState().characters.find((c) => c.id === characterId)

  const broadcastIfDM = (updated: Character): void => {
    const { role, sendMessage } = useNetworkStore.getState()
    // Phase 29e — structural transport gate: only the network host can
    // broadcast `dm:character-update` to relay an authoritative sheet edit
    // to a remote player. Per-sheet write authorization happens upstream
    // via localHasPermission('edit_any_sheet'/'edit_own_sheet').
    // Phase 30 will revisit role-as-string.
    if (role === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
    }
  }

  const saveAndBroadcast = (updated: Character): void => {
    // CH-2b — only persist locally when this client owns the PC; a DM editing a
    // player's PC must not save it into the DM's own library (the owning player
    // persists it on receipt of the broadcast below).
    persistCharacterIfOwned(updated)
    broadcastIfDM(updated)
  }

  return { getLatest, broadcastIfDM, saveAndBroadcast }
}
