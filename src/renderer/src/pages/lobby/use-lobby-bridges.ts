import { useEffect, useRef } from 'react'
import type {
  CharacterSelectPayload,
  CharacterUpdatePayload,
  ChatPayload,
  ChatTimeoutPayload,
  FileSharingPayload,
  SlowModePayload
} from '../../network'
import { onClientMessage, onHostMessage } from '../../network'
import { useCharacterStore } from '../../stores/use-character-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import type { Character } from '../../types/character'
import { logger } from '../../utils/logger'

/**
 * Bridges network messages to the lobby store.
 * Manages peer sync, chat, character updates, moderation, and game-start navigation.
 */
export function useLobbyBridges(role: 'host' | 'client' | 'none', localPeerId: string | null): void {
  usePeerSync(localPeerId)
  useCharacterSelectBridge(role, localPeerId)
  useChatBridge(role, localPeerId)
  useCharacterUpdateBridge(role, localPeerId)
  useModerationBridge(role)
  useChatTimeoutBridge(role)
}

// --- Peer sync: networkStore.peers -> lobbyStore.players ---
function usePeerSync(localPeerId: string | null): void {
  const peers = useNetworkStore((s) => s.peers)

  useEffect(() => {
    if (!localPeerId) return

    const lobby = useLobbyStore.getState()
    const currentPlayers = lobby.players
    const peerIds = new Set(peers.map((p) => p.peerId))

    for (const peer of peers) {
      if (peer.peerId === localPeerId) continue
      const existing = currentPlayers.find((p) => p.peerId === peer.peerId)
      if (!existing) {
        lobby.addPlayer({
          peerId: peer.peerId,
          displayName: peer.displayName,
          characterId: peer.characterId,
          characterName: peer.characterName,
          isReady: peer.isReady,
          isHost: peer.isHost,
          color: peer.color,
          isCoDM: peer.isCoDM
        })
      } else {
        lobby.updatePlayer(peer.peerId, {
          isReady: peer.isReady,
          characterId: peer.characterId,
          characterName: peer.characterName,
          color: peer.color,
          isCoDM: peer.isCoDM
        })
      }
    }

    for (const player of currentPlayers) {
      if (player.peerId === localPeerId) continue
      if (!peerIds.has(player.peerId)) {
        lobby.removePlayer(player.peerId)
      }
    }
  }, [peers, localPeerId])
}

// --- Character select messages -> store remote character data ---
function useCharacterSelectBridge(role: string, localPeerId: string | null): void {
  useEffect(() => {
    const handleCharacterSelect = (msg: { type: string; senderId: string; payload: unknown }): void => {
      if (msg.type !== 'player:character-select') return
      if (msg.senderId === localPeerId) return

      const payload = msg.payload as CharacterSelectPayload
      if (payload.characterId && payload.characterData) {
        useLobbyStore.getState().setRemoteCharacter(payload.characterId, payload.characterData as Character)
      }
    }

    if (role === 'host') {
      return onHostMessage(handleCharacterSelect)
    } else if (role === 'client') {
      return onClientMessage(handleCharacterSelect)
    }
  }, [role, localPeerId])
}

// --- Network chat messages -> lobby chat ---
function useChatBridge(role: string, localPeerId: string | null): void {
  const msgIdRef = useRef(0)

  useEffect(() => {
    const generateMsgId = (): string => `net-${Date.now()}-${++msgIdRef.current}`

    const handleChat = (senderId: string, senderName: string, payload: ChatPayload, timestamp: number): void => {
      if (senderId === localPeerId) return
      const senderPlayer = useLobbyStore.getState().players.find((p) => p.peerId === senderId)
      useLobbyStore.getState().addChatMessage({
        id: generateMsgId(),
        senderId,
        senderName,
        content: payload.message,
        timestamp,
        isSystem: payload.isSystem ?? false,
        isDiceRoll: payload.isDiceRoll,
        diceResult: payload.diceResult,
        senderColor: senderPlayer?.color
      })
    }

    const handleFile = (msg: {
      type: string
      senderId: string
      senderName: string
      timestamp: number
      payload: unknown
    }): void => {
      if (msg.type !== 'chat:file') return
      if (msg.senderId === localPeerId) return
      const payload = msg.payload as { fileName: string; fileType: string; fileData: string; mimeType: string }
      const senderPlayer = useLobbyStore.getState().players.find((p) => p.peerId === msg.senderId)
      useLobbyStore.getState().addChatMessage({
        id: generateMsgId(),
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: `shared a file: ${payload.fileName}`,
        timestamp: msg.timestamp,
        isSystem: false,
        senderColor: senderPlayer?.color,
        isFile: true,
        fileName: payload.fileName,
        fileType: payload.fileType,
        fileData: payload.fileData,
        mimeType: payload.mimeType
      })
    }

    if (role === 'host') {
      return onHostMessage((msg) => {
        if (msg.type === 'chat:message') {
          handleChat(msg.senderId, msg.senderName, msg.payload as ChatPayload, msg.timestamp)
        } else if (msg.type === 'chat:file') {
          handleFile(msg)
        }
      })
    } else if (role === 'client') {
      return onClientMessage((msg) => {
        if (msg.type === 'chat:message') {
          handleChat(msg.senderId, msg.senderName, msg.payload as ChatPayload, msg.timestamp)
        } else if (msg.type === 'chat:file') {
          handleFile(msg)
        }
      })
    }
  }, [role, localPeerId])
}

// --- DM character updates -> client saves locally ---
function useCharacterUpdateBridge(role: string, localPeerId: string | null): void {
  useEffect(() => {
    if (role !== 'client') return

    return onClientMessage((msg) => {
      if (msg.type === 'dm:character-update') {
        const payload = msg.payload as CharacterUpdatePayload
        if (payload.characterId && payload.characterData) {
          const character = payload.characterData as Character

          useLobbyStore.getState().setRemoteCharacter(payload.characterId, character)

          const isTargetedAtMe = payload.targetPeerId === localPeerId
          if (isTargetedAtMe) {
            const localCharacters = useCharacterStore.getState().characters
            const existsLocally = localCharacters.some((c) => c.id === payload.characterId)
            if (existsLocally) {
              useCharacterStore
                .getState()
                .saveCharacter(character)
                .then(() => {
                  logger.debug('[LobbyPage] DM character update saved:', payload.characterId)
                  useCharacterStore.getState().loadCharacters()
                })
                .catch((err) => {
                  logger.error('[LobbyPage] Failed to save DM character update:', err)
                })
            }
          }
        }
      }
    })
  }, [role, localPeerId])
}

// --- Slow-mode + file-sharing ---
function useModerationBridge(role: string): void {
  useEffect(() => {
    if (role !== 'client') return

    return onClientMessage((msg) => {
      if (msg.type === 'dm:slow-mode') {
        const payload = msg.payload as SlowModePayload
        useLobbyStore.getState().setSlowMode(payload.seconds)
        useLobbyStore.getState().addChatMessage({
          id: `sys-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'system',
          senderName: 'System',
          content: payload.seconds === 0 ? 'Slow mode disabled.' : `Slow mode enabled: ${payload.seconds} seconds.`,
          timestamp: Date.now(),
          isSystem: true
        })
      } else if (msg.type === 'dm:file-sharing') {
        const payload = msg.payload as FileSharingPayload
        useLobbyStore.getState().setFileSharingEnabled(payload.enabled)
        useLobbyStore.getState().addChatMessage({
          id: `sys-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'system',
          senderName: 'System',
          content: payload.enabled ? 'File sharing enabled.' : 'File sharing disabled.',
          timestamp: Date.now(),
          isSystem: true
        })
      }
    })
  }, [role])
}

// --- Chat timeout ---
function useChatTimeoutBridge(role: string): void {
  useEffect(() => {
    const handleTimeout = (msg: { type: string; payload: unknown }): void => {
      if (msg.type !== 'dm:chat-timeout') return
      const payload = msg.payload as ChatTimeoutPayload
      const myPeerId = useNetworkStore.getState().localPeerId
      if (payload.peerId === myPeerId) {
        const mutedUntil = Date.now() + payload.duration * 1000
        useLobbyStore.getState().setChatMutedUntil(mutedUntil)
      }
      const targetPlayer = useLobbyStore.getState().players.find((p) => p.peerId === payload.peerId)
      const targetName = targetPlayer?.displayName || 'A player'
      useLobbyStore.getState().addChatMessage({
        id: `sys-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'system',
        senderName: 'System',
        content: `${targetName} has been muted for ${payload.duration} seconds.`,
        timestamp: Date.now(),
        isSystem: true
      })
    }

    if (role === 'host') {
      return onHostMessage(handleTimeout)
    } else if (role === 'client') {
      return onClientMessage(handleTimeout)
    }
  }, [role])
}
