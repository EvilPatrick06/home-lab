import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAiDmStore } from '../../stores/use-ai-dm-store'
import { useCampaignStore } from '../../stores/use-campaign-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'

export default function ReadyButton(): JSX.Element {
  const navigate = useNavigate()
  const { campaignId } = useParams<{ campaignId: string }>()
  const players = useLobbyStore((s) => s.players)
  const isHost = useLobbyStore((s) => s.isHost)
  const allReady = useLobbyStore((s) => s.allPlayersReady)
  const setPlayerReady = useLobbyStore((s) => s.setPlayerReady)
  const localPeerId = useNetworkStore((s) => s.localPeerId)

  const localPlayer = players.find((p) => p.peerId === localPeerId)
  const isReady = localPlayer?.isReady ?? false
  const everyoneReady = allReady()

  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const connectedPeerIds = useNetworkStore((s) => s.connectedPeerIds)

  const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === campaignId)
  const aiDmEnabled = campaign?.aiDm?.enabled ?? false
  const sceneStatus = useAiDmStore((s) => s.sceneStatus)

  const [gameStarting, setGameStarting] = useState(false)
  const [overrideAiWait, setOverrideAiWait] = useState(false)

  useEffect(() => {
    if (sceneStatus === 'preparing') {
      const t = setTimeout(() => setOverrideAiWait(true), 10000)
      return () => clearTimeout(t)
    }
  }, [sceneStatus])

  const handleToggleReady = (): void => {
    if (localPeerId) {
      const newReady = !isReady
      setPlayerReady(localPeerId, newReady)
      sendMessage('player:ready', { isReady: newReady })
    }
  }

  const handleStartGame = async (): Promise<void> => {
    if (gameStarting) return
    setGameStarting(true)

    sendMessage('dm:game-start', { campaignId: campaign?.id || campaignId, campaign: campaign || null })

    // Wait for all clients to acknowledge (max 5 seconds)
    const waitForAcks = async (): Promise<boolean> => {
      // Mocked up acknowledgment logic for clients.
      // Wait for a few seconds as a best-effort mechanism.
      await new Promise((resolve) => setTimeout(resolve, Math.min(connectedPeerIds.length * 500, 5000)))
      return true
    }

    await waitForAcks()
    navigate(`/game/${campaign?.id || campaignId}`)
  }

  const aiReady = !aiDmEnabled || sceneStatus === 'ready' || overrideAiWait
  const canStartGame = everyoneReady && aiReady && !gameStarting

  // DM sees Ready toggle + Start Game button
  if (isHost) {
    return (
      <div className="space-y-2">
        <button
          aria-label={isReady ? 'Mark as not ready' : 'Mark as ready'}
          onClick={handleToggleReady}
          className={`w-full py-2 rounded-lg font-medium text-sm transition-all cursor-pointer
            ${
              isReady
                ? 'bg-green-600/30 border border-green-600 text-green-400'
                : 'bg-transparent border border-gray-600 text-gray-400 hover:border-green-600 hover:text-green-400'
            }`}
        >
          {isReady ? 'DM Ready' : 'Mark Ready'}
        </button>
        <div className="flex flex-col gap-1 w-full">
          <button
            aria-label="Start game session"
            onClick={handleStartGame}
            disabled={!canStartGame}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all
              ${
                canStartGame
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30 cursor-pointer'
                  : 'bg-gray-800 border border-gray-700 text-gray-500 cursor-not-allowed'
              }
              disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
          >
            {gameStarting ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-current"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Starting...
              </>
            ) : !everyoneReady ? (
              'Waiting for Players...'
            ) : !aiReady ? (
              'Waiting for AI DM...'
            ) : (
              'Start Game'
            )}
          </button>
          {!aiReady && sceneStatus === 'preparing' && !overrideAiWait && (
            <p className="text-[10px] text-amber-400/80 text-center animate-pulse">
              Waiting for AI DM to prepare scene...
            </p>
          )}
        </div>
      </div>
    )
  }

  // Players see ready toggle
  return (
    <button
      aria-label={isReady ? 'Mark as not ready' : 'Mark as ready'}
      onClick={handleToggleReady}
      className={`w-full py-3 rounded-lg font-bold text-lg transition-all cursor-pointer
        ${
          isReady
            ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/30'
            : 'bg-transparent border-2 border-green-600 text-green-400 hover:bg-green-900/20'
        }`}
    >
      {isReady ? 'Ready!' : 'Ready'}
    </button>
  )
}
