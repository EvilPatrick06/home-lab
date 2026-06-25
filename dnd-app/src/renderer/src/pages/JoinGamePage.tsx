import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { GameList, PasswordPrompt, UsernamePrompt } from '../components/lobby'
import { BackButton, Button, Input, Spinner } from '../components/ui'
import {
  AUTO_REJOIN_KEY,
  DISPLAY_NAME_KEY,
  INVITE_CODE_LENGTH,
  JOINED_SESSIONS_KEY,
  LAST_SESSION_KEY
} from '../constants'
import { useT } from '../i18n'
import { type LanEvent, startLanScan, stopLanScan, subscribeToLan } from '../network/lan-discovery'
import {
  listGames,
  type RegistryEvent,
  type RegistryGameEntry,
  resolveConnectionMode,
  subscribeToRegistry
} from '../network/registry-client'
import { useNetworkStore } from '../stores/network-store'
import { getOrCreateClientId } from '../utils/client-id'
import { logger } from '../utils/logger'

type PendingTarget = {
  game: RegistryGameEntry
  role: 'player' | 'spectator'
} | null

export default function JoinGamePage(): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const { connectionState, error, joinGame, setError, campaignId } = useNetworkStore()

  // ── Local state ────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(() => {
    try {
      return localStorage.getItem(DISPLAY_NAME_KEY) || ''
    } catch {
      return ''
    }
  })
  // taskId-12: explicit invite-code entry. Needed because clicking a discovered
  // GameCard is the ONLY other join path, and there is no card when the registry
  // is empty/unreachable — so a host who gave out a code had no way for the
  // joiner to use it. (Restores the field removed in 0ca5303d.)
  const [manualInviteCode, setManualInviteCode] = useState('')
  const [waitingForCampaign, setWaitingForCampaign] = useState(false)
  const [registryGames, setRegistryGames] = useState<RegistryGameEntry[]>([])
  const [lanGames, setLanGames] = useState<RegistryGameEntry[]>([])
  const [registryConnected, setRegistryConnected] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<PendingTarget>(null)
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false)
  const [pwTarget, setPwTarget] = useState<{ game: RegistryGameEntry; role: 'player' | 'spectator' } | null>(null)

  const navigatedRef = useRef(false)
  const autoRejoinTriggered = useRef(false)
  // Phase 18k — surface a visible reconnecting state while the stored-session
  // auto-rejoin runs, so a cold reload isn't a blank screen.
  const [autoRejoining, setAutoRejoining] = useState(false)

  // ── Initial load: sync displayName + bootstrap discovery ──────────
  useEffect(() => {
    void window.api.loadSettings().then((settings) => {
      const profileName = settings.userProfile?.displayName
      if (profileName) {
        setDisplayName(profileName)
        try {
          localStorage.setItem(DISPLAY_NAME_KEY, profileName)
        } catch {
          // ignore localStorage failures
        }
      }
    })
  }, [])

  // Pi registry: one-shot listing for fallback + SSE subscribe.
  useEffect(() => {
    const clientId = getOrCreateClientId()
    let cancelled = false

    listGames(clientId)
      .then((games) => {
        if (cancelled) return
        setRegistryGames(games)
        setRegistryConnected(true)
      })
      .catch((err) => {
        if (cancelled) return
        logger.warn('[JoinGame] registry list failed:', err)
        setRegistryConnected(false)
      })

    const unsubscribe = subscribeToRegistry(
      clientId,
      (event: RegistryEvent) => {
        if (cancelled) return
        setRegistryConnected(true)
        if (event.type === 'snapshot') {
          setRegistryGames(event.games)
        } else if (event.type === 'added' || event.type === 'updated') {
          setRegistryGames((prev) => {
            const map = new Map(prev.map((g) => [g.invite_code, g]))
            map.set(event.game.invite_code, event.game)
            return Array.from(map.values())
          })
        } else if (event.type === 'removed') {
          setRegistryGames((prev) => prev.filter((g) => g.invite_code !== event.inviteCode))
        }
      },
      (err) => {
        logger.warn('[JoinGame] registry stream error:', err.message)
        setRegistryConnected(false)
      }
    )

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  // LAN discovery: ask main to start scanning and subscribe to found/removed.
  useEffect(() => {
    void startLanScan().catch((err) => logger.warn('[JoinGame] LAN scan start failed:', err))
    const unsubscribe = subscribeToLan((event: LanEvent) => {
      if (event.type === 'found') {
        setLanGames((prev) => {
          const map = new Map(prev.map((g) => [g.invite_code, g]))
          map.set(event.game.invite_code, event.game)
          return Array.from(map.values())
        })
      } else {
        setLanGames((prev) => prev.filter((g) => g.peer_id !== event.peerId))
      }
    })
    return () => {
      unsubscribe()
      void stopLanScan()
    }
  }, [])

  // Merge registry + LAN, dedup by peer_id (registry wins — it has the live counts).
  const mergedGames = useMemo(() => {
    const byPeer = new Map<string, RegistryGameEntry>()
    for (const g of lanGames) byPeer.set(g.peer_id, g)
    for (const g of registryGames) byPeer.set(g.peer_id, g)
    return Array.from(byPeer.values())
  }, [lanGames, registryGames])

  // ── Auto-rejoin (preserved from old page) ─────────────────────────
  useEffect(() => {
    if (autoRejoinTriggered.current) return
    try {
      const shouldAutoRejoin = localStorage.getItem(AUTO_REJOIN_KEY)
      if (!shouldAutoRejoin) return
      localStorage.removeItem(AUTO_REJOIN_KEY)

      const raw = localStorage.getItem(LAST_SESSION_KEY)
      if (!raw) return
      const session = JSON.parse(raw) as {
        inviteCode: string
        displayName: string
        connectionMode?: 'p2p' | 'cloud'
      }
      if (!session.inviteCode || !session.displayName) return

      autoRejoinTriggered.current = true
      setDisplayName(session.displayName)
      setAutoRejoining(true)

      setTimeout(async () => {
        try {
          setError(null)
          localStorage.setItem(DISPLAY_NAME_KEY, session.displayName)
          // Prefer the mode the session was actually joined with — an on-LAN
          // rejoin of a CLOUD game must not fall back to p2p (resolveConnectionMode
          // with no arg picks p2p on-LAN). Legacy sessions without the field fall
          // back to the LAN/off-LAN default.
          await joinGame(session.inviteCode, session.displayName, resolveConnectionMode(session.connectionMode))
          setWaitingForCampaign(true)
        } catch (err) {
          logger.error('[JoinGame] Auto-rejoin failed:', err)
        } finally {
          setAutoRejoining(false)
        }
      }, 0)
    } catch (e) {
      logger.warn('[JoinGame] Auto-rejoin read failed:', e)
    }
  }, [joinGame, setError])

  // ── Connection navigation ─────────────────────────────────────────
  useEffect(() => {
    if (waitingForCampaign && campaignId && !navigatedRef.current) {
      navigatedRef.current = true
      setWaitingForCampaign(false)
      try {
        const inviteCodeNow = useNetworkStore.getState().inviteCode || ''
        const displayNameNow = useNetworkStore.getState().displayName || displayName
        const session = {
          inviteCode: inviteCodeNow,
          displayName: displayNameNow,
          campaignId,
          campaignName: '',
          connectionMode: useNetworkStore.getState().connectionMode,
          timestamp: Date.now()
        }
        localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session))
        const raw = localStorage.getItem(JOINED_SESSIONS_KEY)
        const sessions: (typeof session)[] = raw ? JSON.parse(raw) : []
        const filtered = sessions.filter((s) => s.campaignId !== campaignId)
        const updated = [session, ...filtered].slice(0, 10)
        localStorage.setItem(JOINED_SESSIONS_KEY, JSON.stringify(updated))
      } catch (e) {
        logger.warn('[JoinGame] Failed to save session:', e)
      }
      navigate(`/lobby/${campaignId}`)
    }
  }, [waitingForCampaign, campaignId, navigate, displayName])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Timeout effect (deps drive the waitingForCampaign gate) uses t only for a timeout error message routed through the network store. Adding fresh-each-render t would reset the setTimeout on every render.
  useEffect(() => {
    if (!waitingForCampaign) return
    const timeout = setTimeout(() => {
      if (!navigatedRef.current) {
        navigatedRef.current = true
        setWaitingForCampaign(false)
        useNetworkStore.getState().setError(t('pages.joinGamePage.timeoutError'))
        useNetworkStore.getState().disconnect()
      }
    }, 15000)
    return () => clearTimeout(timeout)
  }, [waitingForCampaign])

  // ── Connect helper used by all entry paths ────────────────────────
  const persistDisplayName = useCallback(async (name: string): Promise<void> => {
    try {
      localStorage.setItem(DISPLAY_NAME_KEY, name)
      const settings = await window.api.loadSettings()
      const profile = settings.userProfile ?? {
        id: crypto.randomUUID(),
        displayName: '',
        createdAt: new Date().toISOString()
      }
      profile.displayName = name
      await window.api.saveSettings({ ...settings, userProfile: profile })
    } catch (e) {
      logger.warn('[JoinGame] display name sync failed:', e)
    }
  }, [])

  const connectWithCode = useCallback(
    async (code: string, name: string) => {
      setError(null)
      navigatedRef.current = false
      await persistDisplayName(name)
      const normalized = code.trim().toUpperCase()
      // Prefer the host's DECLARED transport (registry `hosting_mode`) so both
      // sides rendezvous; fall back to the on/off-LAN heuristic for a private
      // code with no registry entry (on-LAN → P2P; off-LAN → cloud relay, which
      // works behind any NAT — direct P2P signaling/ICE isn't reachable off-LAN).
      const match = mergedGames.find((g) => g.invite_code === normalized)
      const mode = resolveConnectionMode(match?.hosting_mode)
      try {
        await joinGame(normalized, name.trim(), mode)
        setWaitingForCampaign(true)
      } catch (err) {
        // TR-2 — automatic relay fallback. A P2P join that resolved the host but
        // couldn't open a WebRTC data channel (restrictive NAT / AP isolation /
        // host-side firewall / no reachable TURN) is recoverable over the Pi
        // cloud relay, which works behind any NAT. Retry once on the relay before
        // surfacing the error so players aren't dead-ended at the lobby.
        const msg = err instanceof Error ? err.message : String(err)
        const isDataChannelFailure = /data channel/i.test(msg)
        if (mode === 'p2p' && isDataChannelFailure) {
          logger.warn('[JoinGame] P2P data channel failed; falling back to the cloud relay…')
          try {
            await joinGame(normalized, name.trim(), 'cloud')
            setWaitingForCampaign(true)
            return
          } catch (relayErr) {
            logger.error('[JoinGame] cloud relay fallback also failed:', relayErr)
            return
          }
        }
        logger.error('[JoinGame] join failed:', err)
      }
    },
    [joinGame, persistDisplayName, setError, mergedGames]
  )

  // ── Entry points ──────────────────────────────────────────────────
  const tryConnectGame = useCallback(
    (game: RegistryGameEntry, role: 'player' | 'spectator') => {
      if (!displayName.trim()) {
        setPendingTarget({ game, role })
        setShowUsernamePrompt(true)
        return
      }
      if (game.is_private) {
        setPwTarget({ game, role })
        return
      }
      void connectWithCode(game.invite_code, displayName.trim())
    },
    [displayName, connectWithCode]
  )

  const handleJoin = useCallback((game: RegistryGameEntry) => tryConnectGame(game, 'player'), [tryConnectGame])
  const handleSpectate = useCallback((game: RegistryGameEntry) => tryConnectGame(game, 'spectator'), [tryConnectGame])

  const handleUsernameSubmit = useCallback(
    (name: string) => {
      setDisplayName(name)
      setShowUsernamePrompt(false)
      if (pendingTarget) {
        const target = pendingTarget
        setPendingTarget(null)
        if (target.game.is_private) {
          setPwTarget(target)
        } else {
          void connectWithCode(target.game.invite_code, name)
        }
      }
    },
    [pendingTarget, connectWithCode]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: handlePasswordSubmit useCallback (deps [pwTarget, connectWithCode]) uses t only for the invalid-invite-code error. Listing fresh-each-render t recreates the callback every render.
  const handlePasswordSubmit = useCallback(
    (code: string) => {
      const target = pwTarget
      setPwTarget(null)
      if (target && code === target.game.invite_code) {
        void connectWithCode(code, displayName.trim())
      } else {
        setError(t('pages.joinGamePage.invalidInviteCode'))
      }
    },
    [pwTarget, displayName, connectWithCode, setError]
  )

  const manualValid =
    manualInviteCode.trim().length === INVITE_CODE_LENGTH && /^[A-Z0-9]+$/.test(manualInviteCode.trim().toUpperCase())

  const handleManualConnect = useCallback(() => {
    if (!manualValid || !displayName.trim()) return
    void connectWithCode(manualInviteCode.trim().toUpperCase(), displayName.trim())
  }, [manualInviteCode, manualValid, displayName, connectWithCode])

  const isConnecting = connectionState === 'connecting' || waitingForCampaign

  return (
    <div className="p-8 h-screen overflow-y-auto">
      <BackButton />

      <h1 className="text-3xl font-bold mb-2">{t('pages.joinGamePage.title')}</h1>
      <p className="text-gray-500 mb-6">{t('pages.joinGamePage.subtitle')}</p>

      {autoRejoining && (
        <div
          className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/40 text-amber-300 text-sm"
          role="status"
          aria-live="polite"
        >
          <Spinner size="sm" />
          {t('pages.joinGamePage.reconnecting')}
        </div>
      )}

      <div className="mb-4">
        <Input
          label={t('pages.joinGamePage.displayNameLabel')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('pages.joinGamePage.displayNamePlaceholder')}
          maxLength={30}
          className="max-w-xs"
        />
      </div>

      {/* taskId-12: always-visible invite-code Join field. Lets a player join a
          game by code even when it is not in the browser (private, or registry
          empty/unreachable). */}
      <div className="mb-6">
        <label className="block text-muted mb-1 text-xs uppercase tracking-wider">
          {t('pages.joinGamePage.inviteCodeLabel')}
        </label>
        <div className="flex items-end gap-2">
          <div className="flex-1 max-w-sm">
            <input
              type="text"
              name="invite-code"
              value={manualInviteCode}
              onChange={(e) => setManualInviteCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleManualConnect()
              }}
              placeholder={t('pages.joinGamePage.inviteCodePlaceholder')}
              maxLength={INVITE_CODE_LENGTH + 2}
              className="w-full p-2 rounded-md bg-surface-2 border border-border text-fg font-mono tracking-[0.2em] uppercase focus:outline-none focus:border-amber-500"
            />
          </div>
          <Button
            onClick={handleManualConnect}
            disabled={!manualValid || !displayName.trim() || isConnecting}
            title={
              !displayName.trim()
                ? t('pages.joinGamePage.displayNameRequired')
                : !manualValid
                  ? t('pages.joinGamePage.inviteCodePlaceholder')
                  : undefined
            }
          >
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                {t('pages.joinGamePage.connecting')}
              </span>
            ) : (
              t('pages.joinGamePage.connect')
            )}
          </Button>
        </div>
      </div>

      {isConnecting && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-900/20 border border-amber-700/30 mb-4">
          <Spinner size="sm" />
          <span className="text-sm text-amber-300">
            {waitingForCampaign
              ? t('pages.joinGamePage.waitingForCampaignData')
              : t('pages.joinGamePage.connectingToHost')}
          </span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/30 mb-4">
          <p className="text-sm text-red-300 font-medium">{t('pages.joinGamePage.connectionFailed')}</p>
          <p className="text-xs text-red-400/70 mt-1">{error}</p>
        </div>
      )}

      <GameList
        games={mergedGames}
        registryConnected={registryConnected}
        onJoin={handleJoin}
        onSpectate={handleSpectate}
      />

      {showUsernamePrompt && (
        <UsernamePrompt
          onSubmit={handleUsernameSubmit}
          onCancel={() => {
            setShowUsernamePrompt(false)
            setPendingTarget(null)
          }}
        />
      )}
      {pwTarget && (
        <PasswordPrompt
          gameName={pwTarget.game.name}
          onSubmit={handlePasswordSubmit}
          onCancel={() => setPwTarget(null)}
        />
      )}
    </div>
  )
}
