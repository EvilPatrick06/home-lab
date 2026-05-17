import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { banPeer, chatMutePeer, kickPeer } from '../../network'
import { useNetworkStore } from '../../stores/network-store'
import { useCampaignStore } from '../../stores/use-campaign-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
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
        // Phase 29e ordering: host → players (alphabetical) → spectators (alphabetical).
        if (a.isHost && !b.isHost) return -1
        if (!a.isHost && b.isHost) return 1
        const aSpec = a.role === 'spectator'
        const bSpec = b.role === 'spectator'
        if (aSpec && !bSpec) return 1
        if (!aSpec && bSpec) return -1
        return a.displayName.localeCompare(b.displayName)
      }),
    [players]
  )

  const [announcements, setAnnouncements] = useState<Array<{ id: string; text: string }>>([])
  const prevPlayersRef = useRef(players)

  useEffect(() => {
    const prev = prevPlayersRef.current
    const newAnns: typeof announcements = []

    // Check joins and ready states
    for (const player of players) {
      const pPlayer = prev.find((p) => p.peerId === player.peerId)
      if (!pPlayer) {
        newAnns.push({ id: `join-${player.peerId}-${Date.now()}`, text: `${player.displayName} has joined the lobby` })
      } else if (pPlayer.isReady !== player.isReady) {
        newAnns.push({
          id: `ready-${player.peerId}-${Date.now()}`,
          text: `${player.displayName} is ${player.isReady ? 'ready' : 'no longer ready'}`
        })
      }
    }

    // Check leaves
    for (const pPlayer of prev) {
      if (!players.find((p) => p.peerId === pPlayer.peerId)) {
        newAnns.push({ id: `leave-${pPlayer.peerId}-${Date.now()}`, text: `${pPlayer.displayName} has left the lobby` })
      }
    }

    if (newAnns.length > 0) {
      setAnnouncements((a) => [...a, ...newAnns].slice(-10))
    }

    prevPlayersRef.current = players
  }, [players])

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

  // Phase 29e: DM-only spectator/player role toggle (broadcasts dm:role-change).
  const handlePromoteToPlayer = (peerId: string): void => {
    updatePlayer(peerId, { role: 'player' })
    sendMessage('dm:role-change', { peerId, role: 'player' })
  }
  const handleDemoteToSpectator = (peerId: string): void => {
    updatePlayer(peerId, { role: 'spectator', isReady: false })
    sendMessage('dm:role-change', { peerId, role: 'spectator' })
  }

  const handleColorChange = (color: string): void => {
    // Phase 29d: optimistic local change only — the actual host-confirmed change
    // happens when the player clicks ColorConfirmButton (sends player:color-confirm).
    // Clearing `colorConfirmed` here ensures the Ready button re-locks if the player
    // picks a new color after already confirming a previous one.
    if (localPeerId) {
      updatePlayer(localPeerId, { color, colorConfirmed: false })
      // Phase 17d — broadcast a live preview so OTHER peers see the
      // uncommitted swatch in real time (rendered dashed/dimmed in
      // PlayerCard). Previously player picks stayed visible only on the
      // host's side; the DM picking a color stayed grey to all players
      // until they confirmed.
      sendMessage('player:color-preview', { color })
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sr-only" aria-live="polite">
        {announcements.map((a) => (
          <div key={a.id}>{a.text}</div>
        ))}
      </div>
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
            // Phase 29d: pass colors held by *other* peers so the local player's
            // picker can gray them out.
            const usedByOthers = new Set(
              players.filter((p) => p.peerId !== player.peerId && p.color).map((p) => p.color!)
            )
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
                usedByOtherPeers={isLocal ? usedByOthers : undefined}
                onPromoteToPlayer={
                  isHostView && !isLocal && !player.isHost && player.role === 'spectator'
                    ? () => handlePromoteToPlayer(player.peerId)
                    : undefined
                }
                onDemoteToSpectator={
                  isHostView && !isLocal && !player.isHost && player.role !== 'spectator'
                    ? () => handleDemoteToSpectator(player.peerId)
                    : undefined
                }
              />
            )
          })
        )}
      </div>
    </div>
  )
}
