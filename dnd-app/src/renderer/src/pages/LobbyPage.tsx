import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { LobbyLayout } from '../components/lobby'
import { Button, Modal } from '../components/ui'
import { JOINED_SESSIONS_KEY, LAST_SESSION_KEY, LOBBY_COPY_TIMEOUT_MS } from '../constants'
import {
  onClientMessage,
  setHostCampaignId,
  setHostCaps,
  startHostAnnounce,
  stopHostAnnounce,
  updateHostAnnounce
} from '../network'
import { useNetworkStore } from '../stores/network-store'
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useCampaignStore } from '../stores/use-campaign-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import type { Campaign } from '../types/campaign'
import { getOrCreateClientId } from '../utils/client-id'
import { logger } from '../utils/logger'
import { useLobbyBridges } from './lobby/use-lobby-bridges'

export default function LobbyPage(): JSX.Element {
  const navigate = useNavigate()
  const { campaignId } = useParams<{ campaignId: string }>()

  const { setCampaignId, setIsHost, addPlayer, reset: resetLobby } = useLobbyStore()
  const { connectionState, inviteCode, localPeerId, displayName, role, disconnect, latencyMs } = useNetworkStore()
  const { campaigns, loadCampaigns, saveCampaign } = useCampaignStore()

  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const hasInitialized = useRef(false)

  const campaign = campaigns.find((c) => c.id === campaignId)
  const isHost = role === 'host'
  const sceneStatus = useAiDmStore((s) => s.sceneStatus)

  // AI DM: Pre-generate scene while players are in lobby (host only)
  useEffect(() => {
    if (!isHost || !campaign?.aiDm?.enabled) return

    const aiDmStore = useAiDmStore.getState()

    // Initialize store from campaign config
    aiDmStore.initFromCampaign(campaign)

    // Collect any available character IDs + names for richer AI context
    const players = useLobbyStore.getState().players
    const characterIds = players.filter((p) => p.characterId).map((p) => p.characterId!)
    const characters = useCharacterStore.getState().characters
    const campaignCharNames = characters.filter((c) => characterIds.includes(c.id)).map((c) => c.name)
    logger.info('AI DM scene prep:', campaignCharNames.length, 'characters:', campaignCharNames.join(', '))

    // Trigger scene preparation immediately
    aiDmStore.prepareScene(campaign.id, characterIds)

    // Poll for completion every 3 seconds (update status indicator)
    const interval = setInterval(async () => {
      await aiDmStore.checkSceneStatus(campaign.id)
      if (useAiDmStore.getState().sceneStatus === 'ready') {
        clearInterval(interval)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [isHost, campaign?.id, campaign?.aiDm?.enabled, campaign])

  // Navigate away when kicked, banned, or disconnected with error
  const error = useNetworkStore((s) => s.error)

  useEffect(() => {
    if (connectionState === 'disconnected') {
      const reason = error || 'unknown'
      const isIntentional =
        reason === 'kicked' ||
        reason === 'banned' ||
        reason === 'host-closed' ||
        // MP-8 (v2.1.31 QA): host's End Session broadcasts `dm:game-end` which
        // sets error to "The game session has ended". Without this branch the
        // player stays in the lobby on "Reconnecting…" forever after the host
        // ends the session.
        reason === 'The game session has ended' ||
        role === 'host' ||
        // P-1 (v2.1.31 QA): solo play has role === 'none' and never establishes
        // a network connection at all. After Return-to-Lobby the lobby was
        // showing "Reconnecting…" indefinitely because the disconnect branch
        // didn't know solo wasn't trying to reconnect. Route the user back to
        // the campaign overview where they can choose Solo / Host Game again.
        role === 'none'
      if (isIntentional) {
        logger.warn('Lobby disconnected with intentional reason:', reason)
        resetLobby()
        navigate(role === 'none' && campaignId ? `/campaigns/${campaignId}` : '/', { replace: true })
      } else {
        // Temporary disconnect — keep chat, show reconnecting UI
        setReconnecting(true)
      }
    } else if (connectionState === 'connected') {
      setReconnecting(false)
    }
  }, [connectionState, error, navigate, resetLobby, role, campaignId])

  // Initialize lobby state
  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  // Client: update stored session with campaign name once available
  useEffect(() => {
    if (role !== 'client' || !campaign?.name || !campaignId) return
    try {
      const raw = localStorage.getItem(LAST_SESSION_KEY)
      if (!raw) return
      const session = JSON.parse(raw)
      if (session.campaignId === campaignId && !session.campaignName) {
        session.campaignName = campaign.name
        localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session))
      }
    } catch (e) {
      logger.warn('Failed to parse LAST_SESSION_KEY from localStorage', e)
    }

    try {
      const raw = localStorage.getItem(JOINED_SESSIONS_KEY)
      if (!raw) return
      const sessions = JSON.parse(raw) as Array<{ campaignId: string; campaignName: string }>
      let changed = false
      for (const s of sessions) {
        if (s.campaignId === campaignId && !s.campaignName) {
          s.campaignName = campaign.name
          changed = true
        }
      }
      if (changed) {
        localStorage.setItem(JOINED_SESSIONS_KEY, JSON.stringify(sessions))
      }
    } catch (e) {
      logger.warn('Failed to parse JOINED_SESSIONS_KEY from localStorage', e)
    }
  }, [role, campaign?.name, campaignId])

  // Set the campaign ID on the host manager so joining clients learn it
  useEffect(() => {
    if (isHost && campaignId) {
      setHostCampaignId(campaignId)
    }
  }, [isHost, campaignId])

  // Phase 29e: push the campaign's player/spectator caps into the host
  // manager so handleJoin can enforce them on incoming joins.
  useEffect(() => {
    if (isHost && campaign) {
      setHostCaps(campaign.settings?.maxPlayers ?? 8, campaign.settings?.maxSpectators ?? 5)
    }
  }, [isHost, campaign])

  // Phase 29g: announce the hosted game to LAN (always) + Pi registry
  // (public games only). Heartbeat refreshes the Pi TTL every 30s; we
  // unpublish + deregister when the host leaves the lobby.
  // Scalar fields needed by the announce payload. Pulled out of the
  // campaign object so the announce effect doesn't re-fire (and bounce
  // the registry entry off → on) every time the campaign object reference
  // changes from an unrelated saveCampaign call. Symptom before this fix:
  // friends saw the game appear in the public list for a split second
  // then disappear, because every campaign mutation triggered
  // stopHostAnnounce (DELETE /api/games/<code>) followed by
  // startHostAnnounce (POST /api/games) — the SSE `games:removed`
  // event reached the friend's UI before the `games:added` did.
  const campaignName = campaign?.name ?? null
  const campaignSystem = campaign?.system ?? null
  const campaignMaxPlayers = campaign?.settings?.maxPlayers ?? null
  const campaignMaxSpectators = campaign?.settings?.maxSpectators ?? null
  const campaignIsPrivate = campaign?.settings?.isPrivate ?? null

  useEffect(() => {
    if (!isHost || !campaignName || !inviteCode || !localPeerId || !displayName) return
    let cancelled = false
    void startHostAnnounce({
      invite_code: inviteCode,
      name: campaignName || 'Untitled Game',
      host_display_name: displayName,
      host_client_id: getOrCreateClientId(),
      current_players: 1,
      max_players: campaignMaxPlayers ?? 8,
      current_spectators: 0,
      max_spectators: campaignMaxSpectators ?? 5,
      game_system: campaignSystem || 'dnd5e',
      is_private: campaignIsPrivate ?? false,
      peer_id: localPeerId
    }).catch((err) => logger.warn('[Lobby] announce failed:', err))
    return () => {
      cancelled = true
      void stopHostAnnounce()
      void cancelled
    }
  }, [
    isHost,
    campaignName,
    campaignSystem,
    campaignMaxPlayers,
    campaignMaxSpectators,
    campaignIsPrivate,
    inviteCode,
    localPeerId,
    displayName
  ])

  // Keep the registry entry's player/spectator counts in sync with the lobby.
  const lobbyPlayers = useLobbyStore((s) => s.players)
  useEffect(() => {
    if (!isHost || !inviteCode) return
    let players = 0
    let spectators = 0
    for (const p of lobbyPlayers) {
      if (p.role === 'spectator') spectators++
      else players++
    }
    void updateHostAnnounce({ current_players: players, current_spectators: spectators })
  }, [isHost, inviteCode, lobbyPlayers])

  useEffect(() => {
    if (campaignId) {
      setCampaignId(campaignId)
    }
    setIsHost(isHost)

    // Add local player to the lobby (guard against duplicate adds in StrictMode)
    if (localPeerId && displayName && !hasInitialized.current) {
      hasInitialized.current = true
      addPlayer({
        peerId: localPeerId,
        clientId: getOrCreateClientId(),
        role: isHost ? 'host' : 'player',
        displayName,
        characterId: null,
        characterName: null,
        isReady: false,
        isHost
      })
    }

    return () => {
      // Cleanup on unmount handled by leave confirmation
    }
  }, [campaignId, localPeerId, displayName, isHost, setCampaignId, setIsHost, addPlayer])

  // Bridge network messages to lobby store (peer sync, chat, character updates, moderation)
  useLobbyBridges(role, localPeerId)

  // Client: listen for dm:game-start → inject campaign + navigate to game
  useEffect(() => {
    if (role !== 'client') return
    const unsub = onClientMessage((msg: { type: string; payload: unknown }) => {
      if (msg.type === 'dm:game-start') {
        const payload = msg.payload as { campaignId?: string; campaign?: Campaign }
        logger.info('Game start received, navigating to game:', payload.campaign?.id ?? campaignId)
        if (payload.campaign) {
          useCampaignStore.getState().addCampaignToState(payload.campaign)
          navigate(`/game/${payload.campaign.id}`)
        } else {
          navigate(`/game/${campaignId}`)
        }
      }
    })
    return unsub
  }, [role, campaignId, navigate])

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleCopyInviteCode = async (): Promise<void> => {
    if (inviteCode) {
      const { copyToClipboard } = await import('../utils/clipboard')
      const ok = await copyToClipboard(inviteCode)
      if (ok) {
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
        setCodeCopied(true)
        copyTimeoutRef.current = setTimeout(() => {
          copyTimeoutRef.current = null
          setCodeCopied(false)
        }, LOBBY_COPY_TIMEOUT_MS)
      }
    }
  }

  const handleLeave = (): void => {
    setShowLeaveModal(true)
  }

  const confirmLeave = (): void => {
    logger.info('Player leaving lobby, role:', role)
    disconnect()
    resetLobby()
    navigate('/')
  }

  return (
    <div className="p-6 h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handleLeave} className="text-amber-400 hover:text-amber-300 hover:underline cursor-pointer">
            &larr; Leave Lobby
          </button>

          <div className="h-6 w-px bg-gray-700" />

          <h1 className="text-2xl font-bold text-gray-100">{campaign?.name || 'Game Lobby'}</h1>

          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                connectionState === 'connected' && !reconnecting
                  ? 'bg-green-400'
                  : connectionState === 'connecting' || reconnecting
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-400'
              }`}
            />
            <span className="text-xs text-gray-500 capitalize">{reconnecting ? 'reconnecting' : connectionState}</span>
            {role === 'client' && latencyMs != null && (
              <span className="text-xs text-gray-400 ml-1">Ping: {latencyMs}ms</span>
            )}
          </div>

          {/* AI DM scene preparation status */}
          {isHost && campaign?.aiDm?.enabled && sceneStatus !== 'idle' && (
            <div className="flex items-center gap-1.5">
              {sceneStatus === 'preparing' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs text-amber-400">AI DM preparing scene...</span>
                </>
              )}
              {sceneStatus === 'ready' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-xs text-green-400">Scene ready</span>
                </>
              )}
              {sceneStatus === 'error' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs text-red-400">Scene prep failed</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Invite code — shown only for private games. Public games are
            discoverable via the GameList browser, so surfacing a code is
            both unnecessary and misleading (it suggests gate-keeping
            that doesn't exist). */}
        {inviteCode && campaign?.settings?.isPrivate === true && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Invite Code:</span>
            <button
              onClick={handleCopyInviteCode}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700
                         hover:border-amber-600/50 transition-colors cursor-pointer group"
              title="Click to copy"
            >
              <span className="font-mono text-lg font-bold text-amber-400 tracking-widest">{inviteCode}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 text-gray-500 group-hover:text-amber-400 transition-colors"
              >
                <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
                <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
              </svg>
            </button>
            {codeCopied && <span className="text-xs text-green-400 animate-pulse">Copied!</span>}
          </div>
        )}
        {/* MP-7 (v2.1.31 QA): host can flip Public↔Private mid-session without
            having to delete and recreate the campaign. */}
        {isHost && campaign && (
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                campaign.settings?.isPrivate ? 'bg-gray-800 text-gray-300' : 'bg-emerald-900/40 text-emerald-300'
              }`}
            >
              {campaign.settings?.isPrivate ? 'Private — invite only' : 'Public — listed in browser'}
            </span>
            <button
              type="button"
              onClick={() => {
                const next: Campaign = {
                  ...campaign,
                  settings: {
                    ...campaign.settings,
                    isPrivate: !(campaign.settings?.isPrivate ?? false)
                  },
                  updatedAt: new Date().toISOString()
                }
                void saveCampaign(next)
              }}
              className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full
                         bg-gray-800 border border-gray-700 text-gray-300
                         hover:border-amber-500/60 hover:text-amber-300 cursor-pointer transition-colors"
              title="Toggle whether this game is listed in the public browser"
            >
              {campaign.settings?.isPrivate ? 'Make Public' : 'Make Private'}
            </button>
          </div>
        )}
      </div>

      {/* Main lobby layout */}
      <div className="flex-1 min-h-0">
        <LobbyLayout />
      </div>

      {/* Leave confirmation modal */}
      <Modal open={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="Leave Lobby?">
        <p className="text-gray-400 mb-6">
          Are you sure you want to disconnect and return to the main menu?
          {isHost && (
            <span className="block mt-2 text-amber-400 text-sm">
              As the host, leaving will end the session for all players.
            </span>
          )}
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setShowLeaveModal(false)}>
            Stay
          </Button>
          <Button variant="danger" onClick={confirmLeave}>
            Leave
          </Button>
        </div>
      </Modal>
    </div>
  )
}
