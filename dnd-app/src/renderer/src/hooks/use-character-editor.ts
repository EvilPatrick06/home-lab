import { useCharacterStore } from '../stores/use-character-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import { useNetworkStore } from '../stores/use-network-store'
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
    useCharacterStore.getState().saveCharacter(updated)
    broadcastIfDM(updated)
  }

  return { getLatest, broadcastIfDM, saveAndBroadcast }
}
