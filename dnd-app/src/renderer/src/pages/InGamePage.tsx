import { Swords } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import GameLayout from '../components/game/GameLayout'
import { Spinner } from '../components/ui'
import { LOADING_GRACE_PERIOD_MS, Z } from '../constants'
import { useAutoSaveGame } from '../hooks/use-auto-save'
import { useT } from '../i18n'
import { localHasPermission } from '../services/permissions/local-permission'
import { useNetworkStore } from '../stores/network-store'
import { useBastionStore } from '../stores/use-bastion-store'
import { useCampaignStore } from '../stores/use-campaign-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useGameStore } from '../stores/use-game-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import { totalSecondsFromDateTime } from '../utils/calendar-utils'

export default function InGamePage(): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const { campaignId } = useParams<{ campaignId: string }>()

  const campaigns = useCampaignStore((s) => s.campaigns)
  const loadCampaigns = useCampaignStore((s) => s.loadCampaigns)
  const characters = useCharacterStore((s) => s.characters)
  const loadCharacters = useCharacterStore((s) => s.loadCharacters)
  const networkRole = useNetworkStore((s) => s.role)
  const connectionState = useNetworkStore((s) => s.connectionState)
  const displayName = useNetworkStore((s) => s.displayName)
  const gameCampaignId = useGameStore((s) => s.campaignId)
  const loadGameState = useGameStore((s) => s.loadGameState)
  const [loading, setLoading] = useState(true)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [showReconnect, setShowReconnect] = useState(false)

  useEffect(() => {
    loadCampaigns()
    loadCharacters()
  }, [loadCampaigns, loadCharacters])

  // Warn before closing/refreshing the window during an active game
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), LOADING_GRACE_PERIOD_MS)
    return () => clearTimeout(timeout)
  }, [])

  // Phase 27g — tear down audio when leaving the game session so ambient loops
  // and custom tracks don't leak across navigation.
  useEffect(() => {
    return () => {
      import('../services/sound-manager').then(({ dispose }) => dispose())
    }
  }, [])

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null
  // Phase 17b — CoDM gets the same gameplay perms + view as DM (full
  // hidden-token visibility, DM-only stat lines, fog brush, kick, etc.).
  // Host-management actions (promote/demote, transfer-host) stay gated to
  // the literal host elsewhere; for the InGame view itself, CoDM === DM.
  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const localIsDM = useNetworkStore((s) => s.localIsDM)
  const lobbyPlayers = useLobbyStore((s) => s.players)
  // Phase 29e — gate DM tools through the permission system (use_dm_tools) rather
  // than the `role === 'host' || isCoDM` literal. localHasPermission falls back to
  // the legacy host/CoDM check for campaigns that predate the permissions block.
  // Phase 30e — pass the local DM-authority flag so a transferred DM gets tools.
  const isDM = localHasPermission('use_dm_tools', campaign, {
    networkRole,
    localPeerId,
    isDM: localIsDM,
    peers: lobbyPlayers
  })
  const effectiveDM = isDM || networkRole === 'none'
  const playerCharacter = characters.find((c) => c.campaignId === campaignId) ?? characters[0] ?? null

  // Auto-save game state for DM
  useAutoSaveGame(campaign, effectiveDM)

  // Reconnect UI: detect connection drop for clients
  useEffect(() => {
    if (networkRole !== 'client') return
    if (connectionState === 'disconnected' || connectionState === 'error') {
      setShowReconnect(true)
      setReconnectAttempt(0)
    } else {
      setShowReconnect(false)
    }
  }, [connectionState, networkRole])

  const handleReconnect = async (): Promise<void> => {
    const { inviteCode, connectionMode } = useNetworkStore.getState()
    if (!inviteCode || !displayName) return

    setReconnectAttempt((a) => a + 1)
    try {
      // Reconnect on the SAME transport the session used (cloud relay vs P2P) —
      // the host is still on that transport, so the mode must match to rejoin.
      await useNetworkStore.getState().joinGame(inviteCode, displayName, connectionMode)
      setShowReconnect(false)
    } catch {
      // Error already set in store
    }
  }

  useEffect(() => {
    if (!campaign) return
    if (gameCampaignId !== campaign.id) {
      const saved = campaign.savedGameState

      // Ensure we don't overwrite a newer local auto-save with an older campaign state.
      // `lastSaveTimestamp` isn't on the canonical store state, so read it via an
      // out-of-type view (defaults to 0 when absent) — behavior preserved.
      const currentStoreState = useGameStore.getState() as unknown as { lastSaveTimestamp?: number }
      const localTimestamp = currentStoreState.lastSaveTimestamp || 0
      const incomingTimestamp = saved?.lastSaveTimestamp || 0

      if (localTimestamp > 0 && incomingTimestamp > 0 && incomingTimestamp < localTimestamp) {
        console.warn('Skipping state load: Local game state is newer than campaign saved state')
        return
      }

      loadGameState({
        campaignId: campaign.id,
        system: campaign.system,
        activeMapId: campaign.activeMapId ?? null,
        maps: campaign.maps ?? [],
        turnMode: campaign.turnMode ?? 'free',
        initiative: saved?.initiative ?? null,
        round: saved?.round ?? 0,
        conditions: saved?.conditions ?? [],
        turnStates: saved?.turnStates ?? {},
        isPaused: saved?.isPaused ?? false,
        underwaterCombat: saved?.underwaterCombat ?? false,
        ambientLight: saved?.ambientLight ?? 'bright',
        travelPace: saved?.travelPace ?? null,
        marchingOrder: saved?.marchingOrder ?? [],
        allies: saved?.allies ?? [],
        enemies: saved?.enemies ?? [],
        places: saved?.places ?? [],
        inGameTime:
          saved?.inGameTime ??
          (campaign.calendar
            ? {
                totalSeconds:
                  campaign.calendar.startingTime ??
                  totalSecondsFromDateTime(campaign.calendar.startingYear, 0, 1, 8, 0, 0, campaign.calendar)
              }
            : null),
        restTracking: saved?.restTracking ?? null,
        activeLightSources: saved?.activeLightSources ?? [],
        handouts: saved?.handouts ?? [],
        combatTimer: saved?.combatTimer ?? null,
        sessionLog: saved?.sessionLog,
        sharedJournal: saved?.sharedJournal,
        lastSaveTimestamp: saved?.lastSaveTimestamp
      } as Parameters<typeof loadGameState>[0])
    }
  }, [campaign, gameCampaignId, loadGameState])

  useEffect(() => {
    if (!campaign) return
    const bastionStore = useBastionStore.getState()
    if (!bastionStore.hasLoaded) return
    const playerCharIds = characters.map((c) => c.id)
    const unlinked = bastionStore.bastions.filter((b) => b.campaignId === null && playerCharIds.includes(b.ownerId))
    for (const bastion of unlinked) {
      bastionStore.saveBastion({ ...bastion, campaignId: campaign.id })
    }
  }, [campaign, characters])

  if (!campaign && loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-base text-fg">
        <Spinner size="lg" />
        <p className="text-muted mt-4">{t('pages.inGamePage.loadingCampaign')}</p>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-base text-fg">
        <div className="text-center">
          <Swords className="w-12 h-12 mx-auto mb-4 text-muted" aria-hidden="true" />
          <h1 className="text-2xl font-bold mb-2">{t('pages.inGamePage.noCampaignFound')}</h1>
          <p className="text-muted mb-6">
            {campaignId
              ? t('pages.inGamePage.campaignCouldNotLoad', { id: campaignId })
              : t('pages.inGamePage.noCampaignId')}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-lg font-semibold bg-amber-600 hover:bg-accent-strong
              text-white transition-colors cursor-pointer"
          >
            {t('pages.inGamePage.backToMenu')}
          </button>
        </div>
      </div>
    )
  }

  const playerName = displayName || t('pages.inGamePage.defaultPlayerName')

  return (
    <>
      <GameLayout campaign={campaign} isDM={effectiveDM} character={playerCharacter} playerName={playerName} />

      {/* Reconnect overlay for clients */}
      {showReconnect && networkRole === 'client' && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          style={{ zIndex: Z.MODAL }}
        >
          <div className="bg-surface border border-red-500/50 rounded-xl p-6 max-w-sm w-full mx-4 text-center">
            <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-red-400 mb-2">{t('pages.inGamePage.connectionLost')}</h2>
            <p className="text-sm text-muted mb-1">
              {reconnectAttempt > 0
                ? t('pages.inGamePage.reconnectingAttempt', { attempt: reconnectAttempt })
                : t('pages.inGamePage.attemptingReconnect')}
            </p>
            {reconnectAttempt >= 3 && (
              <p className="text-xs text-red-400/70 mb-3">{t('pages.inGamePage.reconnectFailed')}</p>
            )}
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={handleReconnect}
                disabled={reconnectAttempt >= 3}
                className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-accent-strong text-white
                  rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('pages.inGamePage.reconnect')}
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 text-sm font-semibold border border-gray-600 hover:bg-surface-2
                  text-gray-300 rounded-lg transition-colors cursor-pointer"
              >
                {t('pages.inGamePage.leaveGame')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
