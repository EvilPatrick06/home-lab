import { useNavigate, useParams } from 'react-router'
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

  const handleToggleReady = (): void => {
    if (localPeerId) {
      const newReady = !isReady
      setPlayerReady(localPeerId, newReady)
      sendMessage('player:ready', { isReady: newReady })
    }
  }

  const handleStartGame = (): void => {
    const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === campaignId)
    if (campaign) {
      sendMessage('dm:game-start', { campaignId: campaign.id, campaign })
      navigate(`/game/${campaign.id}`)
    } else {
      // Fallback: still navigate even without campaign data
      sendMessage('dm:game-start', { campaignId, campaign: null })
      navigate(`/game/${campaignId}`)
    }
  }

  // DM sees Ready toggle + Start Game button
  if (isHost) {
    return (
      <div className="space-y-2">
        <button
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
        <button
          onClick={handleStartGame}
          disabled={!everyoneReady}
          className={`w-full py-3 rounded-lg font-bold text-lg transition-all cursor-pointer
            ${
              everyoneReady
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30'
                : 'bg-gray-800 border border-gray-700 text-gray-500 cursor-not-allowed'
            }
            disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {everyoneReady ? 'Start Game' : 'Waiting for Players...'}
        </button>
      </div>
    )
  }

  // Players see ready toggle
  return (
    <button
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
