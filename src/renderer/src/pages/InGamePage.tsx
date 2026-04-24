import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import GameLayout from '../components/game/GameLayout'
import { Spinner } from '../components/ui'
import { LOADING_GRACE_PERIOD_MS } from '../constants'
import { useAutoSaveGame } from '../hooks/use-auto-save'
import { useBastionStore } from '../stores/use-bastion-store'
import { useCampaignStore } from '../stores/use-campaign-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useGameStore } from '../stores/use-game-store'
import { useNetworkStore } from '../stores/use-network-store'
import { totalSecondsFromDateTime } from '../utils/calendar-utils'

export default function InGamePage(): JSX.Element {
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

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null
  const isDM = networkRole === 'host' || (networkRole === 'none' && campaign?.dmId === 'local')
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
    const { inviteCode } = useNetworkStore.getState()
    if (!inviteCode || !displayName) return

    setReconnectAttempt((a) => a + 1)
    try {
      await useNetworkStore.getState().joinGame(inviteCode, displayName)
      setShowReconnect(false)
    } catch {
      // Error already set in store
    }
  }

  useEffect(() => {
    if (!campaign) return
    if (gameCampaignId !== campaign.id) {
      const saved = campaign.savedGameState
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
        combatTimer: saved?.combatTimer ?? null
      })
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
      <div className="h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100">
        <Spinner size="lg" />
        <p className="text-gray-400 mt-4">Loading campaign...</p>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100">
        <div className="text-center">
          <div className="text-5xl mb-4">&#9876;</div>
          <h1 className="text-2xl font-bold mb-2">No Campaign Found</h1>
          <p className="text-gray-400 mb-6">
            {campaignId ? `Campaign "${campaignId}" could not be loaded.` : 'No campaign ID specified.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-lg font-semibold bg-amber-600 hover:bg-amber-500
              text-white transition-colors cursor-pointer"
          >
            Back to Menu
          </button>
        </div>
      </div>
    )
  }

  const playerName = displayName || 'Player'

  return (
    <>
      <GameLayout campaign={campaign} isDM={effectiveDM} character={playerCharacter} playerName={playerName} />

      {/* Reconnect overlay for clients */}
      {showReconnect && networkRole === 'client' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-red-500/50 rounded-xl p-6 max-w-sm w-full mx-4 text-center">
            <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-red-400 mb-2">Connection Lost</h2>
            <p className="text-sm text-gray-400 mb-1">
              {reconnectAttempt > 0 ? `Reconnecting... (attempt ${reconnectAttempt}/3)` : 'Attempting to reconnect...'}
            </p>
            {reconnectAttempt >= 3 && (
              <p className="text-xs text-red-400/70 mb-3">
                Multiple reconnection attempts failed. The host may have ended the session.
              </p>
            )}
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={handleReconnect}
                disabled={reconnectAttempt >= 3}
                className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white
                  rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reconnect
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 text-sm font-semibold border border-gray-600 hover:bg-gray-800
                  text-gray-300 rounded-lg transition-colors cursor-pointer"
              >
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
