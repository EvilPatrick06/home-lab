import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import CloudStatusPanel from '../components/game/cloud/CloudStatusPanel'
import { LobbyLayout } from '../components/lobby'
import { Button, Modal } from '../components/ui'
import { JOINED_SESSIONS_KEY, LAST_SESSION_KEY, LOBBY_COPY_TIMEOUT_MS } from '../constants'
import { useT } from '../i18n'
import {
  onClientMessage,
  setHostCampaignId,
  setHostCaps,
  startHostAnnounce,
  stopHostAnnounce,
  updateHostAnnounce
} from '../network'
import { configureAiFromCampaign } from '../services/ai-dm-routing'
import { useNetworkStore } from '../stores/network-store'
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useCampaignStore } from '../stores/use-campaign-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useGameStore } from '../stores/use-game-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import type { Campaign } from '../types/campaign'
import { getOrCreateClientId } from '../utils/client-id'
import { logger } from '../utils/logger'
import { useLobbyBridges } from './lobby/use-lobby-bridges'

export default function LobbyPage(): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const { campaignId } = useParams<{ campaignId: string }>()

  const { setCampaignId, setIsHost, addPlayer, reset: resetLobby } = useLobbyStore()
  const { connectionState, inviteCode, localPeerId, displayName, role, disconnect, latencyMs } = useNetworkStore()
  // Phase 32 — cloud relay status (DM-only panel below).
  const connectionMode = useNetworkStore((s) => s.connectionMode)
  const networkPeers = useNetworkStore((s) => s.peers)
  const { campaigns, loadCampaigns, saveCampaign } = useCampaignStore()

  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const hasInitialized = useRef(false)
  // Set by the explicit "Leave Lobby" button so the disconnect effect below does
  // not override its main-menu navigation (see confirmLeave + the effect).
  const handledLeaveRef = useRef(false)

  const campaign = campaigns.find((c) => c.id === campaignId)
  // Phase 29e — `isHost` here is a structural transport check used only to
  // decide whether to run the host-side AI DM scene-prep poller. Gameplay
  // gates (DM tools, moderation, etc.) flow through `localHasPermission`
  // elsewhere. Phase 30 will revisit role-as-string.
  const isHost = role === 'host'
  const sceneStatus = useAiDmStore((s) => s.sceneStatus)
  const sceneError = useAiDmStore((s) => s.sceneError)
  const scenePrepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // AI DM: Pre-generate scene while players are in lobby (host only). Extracted
  // into a callback so the "Retry" button (S-2) can re-run it after a failure.
  const startScenePrep = useCallback(() => {
    if (!isHost || !campaign?.aiDm?.enabled) return

    const aiDmStore = useAiDmStore.getState()
    aiDmStore.initFromCampaign(campaign)

    // Collect any available character IDs + names for richer AI context
    const players = useLobbyStore.getState().players
    const characterIds = players.filter((p) => p.characterId).map((p) => p.characterId!)
    const characters = useCharacterStore.getState().characters
    const campaignCharNames = characters.filter((c) => characterIds.includes(c.id)).map((c) => c.name)
    logger.info('AI DM scene prep:', campaignCharNames.length, 'characters:', campaignCharNames.join(', '))

    // S-4 — apply the campaign's chosen model/provider before generating the
    // scene so prep uses the model the user picked (not the stale global config).
    void configureAiFromCampaign(campaign).finally(() => {
      aiDmStore.prepareScene(campaign.id, characterIds)
    })

    // Poll for completion every 3s; stop on ready OR error (a failed prep waits
    // for the user to hit Retry rather than spinning forever).
    if (scenePrepIntervalRef.current) clearInterval(scenePrepIntervalRef.current)
    scenePrepIntervalRef.current = setInterval(async () => {
      await aiDmStore.checkSceneStatus(campaign.id)
      const status = useAiDmStore.getState().sceneStatus
      if (status === 'ready' || status === 'error') {
        if (scenePrepIntervalRef.current) clearInterval(scenePrepIntervalRef.current)
        scenePrepIntervalRef.current = null
      }
    }, 3000)
  }, [isHost, campaign])

  useEffect(() => {
    startScenePrep()
    return () => {
      if (scenePrepIntervalRef.current) clearInterval(scenePrepIntervalRef.current)
      scenePrepIntervalRef.current = null
    }
  }, [startScenePrep])

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
        // Phase 29e — structural transport check: the host is the one who
        // triggered the disconnect themselves (e.g. via Stop Hosting), so
        // it's intentional. Not a permission gate. Phase 30 will revisit.
        role === 'host' ||
        // P-1 (v2.1.31 QA): solo play has role === 'none' and never establishes
        // a network connection at all. After Return-to-Lobby the lobby was
        // showing "Reconnecting…" indefinitely because the disconnect branch
        // didn't know solo wasn't trying to reconnect. Route the user back to
        // the campaign overview where they can choose Solo / Host Game again.
        role === 'none'
      if (isIntentional) {
        // The explicit "Leave Lobby" button (confirmLeave) already navigated to
        // the main menu the confirm dialog promises; don't override it (a
        // just-hosted user is now role==='none', which would otherwise fall into
        // the campaign-hub redirect below).
        if (handledLeaveRef.current) {
          handledLeaveRef.current = false
          return
        }
        logger.warn('Lobby disconnected with intentional reason:', reason)
        resetLobby()
        // The campaign hub route is `/campaign/:id` (singular). The previous
        // `/campaigns/${campaignId}` matched no route → "Page Not Found" on leave.
        navigate(role === 'none' && campaignId ? `/campaign/${campaignId}` : '/', { replace: true })
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
  // Phase 32 fix — announce the transport the host is ACTUALLY on (the
  // network store's resolved connectionMode), NOT the campaign's static
  // hostingMode. A default-p2p campaign hosted off-LAN routes through the Pi
  // cloud relay (CampaignDetailPage: hostingMode===cloud || !isOnPiLan) and so
  // has NO PeerJS peer. Announcing the static p2p made joiners resolve to the
  // PeerJS path and hit peer-unavailable (No game found with that invite code)
  // even though the relay host showed Connected and the game listed. Announce
  // connectionMode so the joiner (resolveConnectionMode(match.hosting_mode))
  // rendezvous on the same wire.
  const announceHostingMode = connectionMode

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
      peer_id: localPeerId,
      hosting_mode: announceHostingMode
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
    announceHostingMode,
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

  // Phase 17g — mid-game rejoin auto-transition. Previously a player who
  // left a running game and rejoined via JoinGamePage landed in the
  // lobby and waited for `dm:game-start` — which never fires because
  // the game is ALREADY started. Detect game-in-progress (activeMapId
  // set in the synced game state) and auto-navigate to /game/. This
  // makes the rejoin invisible to the user (they end up where the
  // session is, not stuck in lobby).
  const gameActiveMapId = useGameStore((s) => s.activeMapId)
  const inGameAutoNavigated = useRef(false)
  useEffect(() => {
    if (role !== 'client') return
    if (inGameAutoNavigated.current) return
    if (!gameActiveMapId || !campaignId) return
    inGameAutoNavigated.current = true
    logger.info('[Lobby] Detected in-progress game on rejoin → auto-navigating to /game/', campaignId)
    navigate(`/game/${campaignId}`)
  }, [role, gameActiveMapId, campaignId, navigate])

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
    handledLeaveRef.current = true
    disconnect()
    resetLobby()
    // BUG-4 — a DM who just ended their session belongs back at their campaign hub
    // (where Host/Solo live), not the join-a-game browser. Players (clients) may not
    // have that campaign locally, so send them to the main menu. `replace` drops the
    // dead lobby from history so Back doesn't return to it.
    navigate(role === 'host' && campaignId ? `/campaign/${campaignId}` : '/', { replace: true })
  }

  return (
    // Phase 17t — leave room on the right for the page-global settings gear
    // (rendered absolutely-positioned at top-3 right-3 by GlobalSettingsButton).
    // Without this padding the lobby's right-aligned header controls
    // (Make Public/Private toggle, invite-code chip) ran into the gear.
    <div className="p-6 pr-16 h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handleLeave} className="text-accent hover:text-amber-300 hover:underline cursor-pointer">
            &larr; {t('pages.lobbyPage.leaveLobby')}
          </button>

          <div className="h-6 w-px bg-gray-700" />

          <h1 className="text-2xl font-bold text-fg">{campaign?.name || t('pages.lobbyPage.gameLobby')}</h1>

          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                connectionState === 'connected' && !reconnecting
                  ? 'bg-green-400'
                  : connectionState === 'connecting' || reconnecting
                    ? 'bg-accent animate-pulse'
                    : 'bg-red-400'
              }`}
            />
            <span className="text-xs text-gray-500 capitalize">{reconnecting ? 'reconnecting' : connectionState}</span>
            {role === 'client' && latencyMs != null && (
              <span className="text-xs text-muted ml-1">{t('pages.lobbyPage.ping', { ms: latencyMs })}</span>
            )}
          </div>

          {/* AI DM scene preparation status */}
          {isHost && campaign?.aiDm?.enabled && sceneStatus !== 'idle' && (
            <div className="flex items-center gap-1.5">
              {sceneStatus === 'preparing' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs text-accent">{t('pages.lobbyPage.scenePreparing')}</span>
                </>
              )}
              {sceneStatus === 'ready' && (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-xs text-green-400">{t('pages.lobbyPage.sceneReady')}</span>
                </>
              )}
              {sceneStatus === 'error' && (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-xs text-red-400">{t('pages.lobbyPage.scenePrepFailed')}</span>
                    <button
                      type="button"
                      onClick={startScenePrep}
                      className="text-xs text-accent underline hover:no-underline"
                    >
                      {t('pages.lobbyPage.scenePrepRetry')}
                    </button>
                  </div>
                  {sceneError && <span className="max-w-xs text-[11px] text-red-300/80">{sceneError}</span>}
                </div>
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
            <span className="text-xs text-gray-500 uppercase tracking-wide">{t('pages.lobbyPage.inviteCode')}</span>
            <button
              onClick={handleCopyInviteCode}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border
                         hover:border-amber-600/50 transition-colors cursor-pointer group"
              title={t('pages.lobbyPage.clickToCopy')}
            >
              <span className="font-mono text-lg font-bold text-accent tracking-widest">{inviteCode}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 text-gray-500 group-hover:text-accent transition-colors"
              >
                <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
                <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
              </svg>
            </button>
            {codeCopied && <span className="text-xs text-green-400 animate-pulse">{t('pages.lobbyPage.copied')}</span>}
          </div>
        )}
        {/* MP-7 (v2.1.31 QA): host can flip Public↔Private mid-session without
            having to delete and recreate the campaign. */}
        {isHost && campaign && (
          <div className="flex items-center gap-2">
            <span
              className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded-full ${
                campaign.settings?.isPrivate ? 'bg-surface-2 text-gray-300' : 'bg-emerald-900/40 text-emerald-300'
              }`}
            >
              {campaign.settings?.isPrivate
                ? t('pages.lobbyPage.privateInviteOnly')
                : t('pages.lobbyPage.publicListed')}
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
              className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full
                         bg-surface-2 border border-border text-gray-300
                         hover:border-amber-500/60 hover:text-amber-300 cursor-pointer transition-colors"
              title={t('pages.lobbyPage.togglePublicTitle')}
            >
              {campaign.settings?.isPrivate ? t('pages.lobbyPage.makePublic') : t('pages.lobbyPage.makePrivate')}
            </button>
          </div>
        )}
      </div>

      {/* Phase 32 — cloud-relay status (DM-only; hidden for P2P games). */}
      {isHost && connectionMode === 'cloud' && (
        <div className="mb-4 flex-shrink-0">
          <CloudStatusPanel
            connectionMode={connectionMode}
            isDM={isHost}
            connected={connectionState === 'connected'}
            peers={networkPeers}
          />
        </div>
      )}

      {/* Main lobby layout */}
      <div className="flex-1 min-h-0">
        <LobbyLayout />
      </div>

      {/* Leave confirmation modal */}
      <Modal
        open={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title={t('pages.lobbyPage.leaveLobbyTitle')}
      >
        <p className="text-muted mb-6">
          {t('pages.lobbyPage.leaveConfirm')}
          {isHost && <span className="block mt-2 text-accent text-sm">{t('pages.lobbyPage.hostLeaveWarning')}</span>}
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setShowLeaveModal(false)}>
            {t('pages.lobbyPage.stay')}
          </Button>
          <Button variant="danger" onClick={confirmLeave}>
            {t('pages.lobbyPage.leave')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
