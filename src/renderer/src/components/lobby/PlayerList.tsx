import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { banPeer, chatMutePeer, kickPeer } from '../../network'
import { useCampaignStore } from '../../stores/use-campaign-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import { PlayerCard } from '.'

export default function PlayerList(): JSX.Element {
  const navigate = useNavigate()
  const players = useLobbyStore((s) => s.players)
  const locallyMutedPeers = useLobbyStore((s) => s.locallyMutedPeers)
  const toggleLocalMutePlayer = useLobbyStore((s) => s.toggleLocalMutePlayer)
  const updatePlayer = useLobbyStore((s) => s.updatePlayer)
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const role = useNetworkStore((s) => s.role)
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const removePeer = useNetworkStore((s) => s.removePeer)

  const { campaignId } = useParams<{ campaignId: string }>()
  const isHostView = role === 'host'

  // Check if AI DM is enabled for this campaign
  const campaigns = useCampaignStore((s) => s.campaigns)
  const campaign = campaigns.find((c) => c.id === campaignId)
  const aiDmEnabled = campaign?.aiDm?.enabled ?? false
  const aiDmOllamaModel = campaign?.aiDm?.ollamaModel ?? 'llama3.1'

  const sortedPlayers = useMemo(
    () =>
      [...players].sort((a, b) => {
        if (a.isHost && !b.isHost) return -1
        if (!a.isHost && b.isHost) return 1
        return a.displayName.localeCompare(b.displayName)
      }),
    [players]
  )

  const handleViewCharacter = (characterId: string | null): void => {
    if (!characterId) return
    navigate(`/characters/5e/${characterId}`, { state: { returnTo: `/lobby/${campaignId}` } })
  }

  const handleKick = (peerId: string): void => {
    kickPeer(peerId)
    removePeer(peerId)
  }

  const handleBan = (peerId: string): void => {
    banPeer(peerId)
    removePeer(peerId)
  }

  const handleChatTimeout = (peerId: string): void => {
    chatMutePeer(peerId, 300000) // 5 minutes
  }

  const handlePromoteCoDM = (peerId: string): void => {
    updatePlayer(peerId, { isCoDM: true })
    sendMessage('dm:promote-codm', { peerId, isCoDM: true })
  }

  const handleDemoteCoDM = (peerId: string): void => {
    updatePlayer(peerId, { isCoDM: false })
    sendMessage('dm:demote-codm', { peerId, isCoDM: false })
  }

  const handleColorChange = (color: string): void => {
    if (localPeerId) {
      updatePlayer(localPeerId, { color })
      sendMessage('player:color-change', { color })
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Players</h2>
        <span className="text-xs text-gray-500">{players.length} connected</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* AI DM entry */}
        {aiDmEnabled && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-purple-900/20 border border-purple-700/30">
            <div className="w-8 h-8 rounded-full bg-purple-800/50 flex items-center justify-center text-purple-300 text-sm font-bold shrink-0">
              AI
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-purple-200">AI Dungeon Master</div>
              <div className="text-[10px] text-purple-400">Ollama ({aiDmOllamaModel})</div>
            </div>
            <span className="text-[10px] text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">Ready</span>
          </div>
        )}

        {sortedPlayers.length === 0 && !aiDmEnabled ? (
          <p className="text-sm text-gray-600 text-center py-8">Waiting for players...</p>
        ) : (
          sortedPlayers.map((player) => {
            const isLocal = player.peerId === localPeerId
            return (
              <PlayerCard
                key={player.peerId}
                player={player}
                isLocal={isLocal}
                isLocallyMuted={locallyMutedPeers.includes(player.peerId)}
                onToggleLocalMute={() => toggleLocalMutePlayer(player.peerId)}
                isHostView={isHostView}
                onViewCharacter={player.characterId ? () => handleViewCharacter(player.characterId) : undefined}
                onKick={isHostView && !isLocal && !player.isHost ? () => handleKick(player.peerId) : undefined}
                onBan={isHostView && !isLocal && !player.isHost ? () => handleBan(player.peerId) : undefined}
                onChatTimeout={
                  isHostView && !isLocal && !player.isHost ? () => handleChatTimeout(player.peerId) : undefined
                }
                onPromoteCoDM={
                  isHostView && !isLocal && !player.isHost ? () => handlePromoteCoDM(player.peerId) : undefined
                }
                onDemoteCoDM={
                  isHostView && !isLocal && !player.isHost ? () => handleDemoteCoDM(player.peerId) : undefined
                }
                onColorChange={isLocal ? handleColorChange : undefined}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
