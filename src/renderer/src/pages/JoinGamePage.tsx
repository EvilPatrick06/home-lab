import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { BackButton, Button, Input, Spinner } from '../components/ui'
import { AUTO_REJOIN_KEY, DISPLAY_NAME_KEY, JOINED_SESSIONS_KEY, LAST_SESSION_KEY } from '../constants'
import { useNetworkStore } from '../stores/use-network-store'
import { logger } from '../utils/logger'

export default function JoinGamePage(): JSX.Element {
  const navigate = useNavigate()
  const { connectionState, error, joinGame, setError, campaignId } = useNetworkStore()

  const [inviteCode, setInviteCode] = useState('')
  const [displayName, setDisplayName] = useState(() => {
    try {
      return localStorage.getItem(DISPLAY_NAME_KEY) || ''
    } catch (e) {
      logger.warn('[JoinGame] localStorage read failed:', e)
      return ''
    }
  })
  const [waitingForCampaign, setWaitingForCampaign] = useState(false)

  // Fall back to settings profile if localStorage display name is empty
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only effect
  useEffect(() => {
    if (displayName) return
    window.api.loadSettings().then((settings) => {
      if (settings.userProfile?.displayName) {
        setDisplayName(settings.userProfile.displayName)
      }
    })
  }, [])
  const navigatedRef = useRef(false)
  const autoRejoinTriggered = useRef(false)

  const canConnect = inviteCode.trim().length > 0 && displayName.trim().length > 0
  const isConnecting = connectionState === 'connecting' || waitingForCampaign

  // Auto-rejoin: pre-fill from last session and connect automatically
  useEffect(() => {
    if (autoRejoinTriggered.current) return
    try {
      const shouldAutoRejoin = localStorage.getItem(AUTO_REJOIN_KEY)
      if (!shouldAutoRejoin) return
      localStorage.removeItem(AUTO_REJOIN_KEY)

      const raw = localStorage.getItem(LAST_SESSION_KEY)
      if (!raw) return
      const session = JSON.parse(raw) as { inviteCode: string; displayName: string }
      if (!session.inviteCode || !session.displayName) return

      autoRejoinTriggered.current = true
      setInviteCode(session.inviteCode)
      setDisplayName(session.displayName)

      // Defer the connection attempt to next tick so state is applied
      setTimeout(async () => {
        try {
          setError(null)
          localStorage.setItem(DISPLAY_NAME_KEY, session.displayName)
          await joinGame(session.inviteCode, session.displayName)
          setWaitingForCampaign(true)
        } catch (err) {
          logger.error('[JoinGame] Auto-rejoin failed:', err)
        }
      }, 0)
    } catch (e) {
      logger.warn('[JoinGame] Auto-rejoin read failed:', e)
    }
  }, [joinGame, setError])

  // When host sends game:state-full with campaignId, navigate to the real lobby URL
  useEffect(() => {
    if (waitingForCampaign && campaignId && !navigatedRef.current) {
      navigatedRef.current = true
      setWaitingForCampaign(false)

      // Persist session info for future rejoin
      try {
        const session = {
          inviteCode: inviteCode.trim() || useNetworkStore.getState().inviteCode || '',
          displayName: displayName || useNetworkStore.getState().displayName || '',
          campaignId,
          campaignName: '',
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
  }, [waitingForCampaign, campaignId, navigate, inviteCode, displayName])

  // Fallback: if connected but no campaignId after 15s, show error instead of navigating to a broken URL
  useEffect(() => {
    if (!waitingForCampaign) return
    const timeout = setTimeout(() => {
      if (!navigatedRef.current) {
        navigatedRef.current = true
        setWaitingForCampaign(false)
        useNetworkStore.getState().setError('Timed out waiting for host to send campaign data. Please try again.')
        useNetworkStore.getState().disconnect()
      }
    }, 15000)
    return () => clearTimeout(timeout)
  }, [waitingForCampaign])

  const handleConnect = async (): Promise<void> => {
    if (!canConnect || isConnecting) return

    setError(null)
    navigatedRef.current = false

    try {
      localStorage.setItem(DISPLAY_NAME_KEY, displayName.trim())
    } catch (e) {
      logger.warn('[JoinGame] localStorage write failed:', e)
    }

    try {
      await joinGame(inviteCode.trim().toUpperCase(), displayName.trim())
      setWaitingForCampaign(true)
    } catch (error) {
      logger.error('[JoinGame] Failed to join game:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && canConnect && !isConnecting) {
      handleConnect()
    }
  }

  return (
    <div className="p-8 h-screen overflow-y-auto">
      <BackButton />

      <h1 className="text-3xl font-bold mb-2">Join Game</h1>
      <p className="text-gray-500 mb-8">Enter the invite code from your Dungeon Master to join their game.</p>

      <div className="max-w-md space-y-6">
        {/* Display name */}
        <Input
          label="Display Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter your name"
          maxLength={30}
        />

        {/* Invite code */}
        <div>
          <label className="block text-gray-400 mb-2 text-sm">Invite Code</label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            onKeyDown={handleKeyDown}
            placeholder="e.g. ABC123"
            maxLength={10}
            className="w-full p-4 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
                       placeholder-gray-600 focus:border-amber-500 focus:outline-none
                       transition-colors text-center text-2xl font-mono font-bold tracking-[0.3em]
                       uppercase"
          />
        </div>

        {/* Connection status indicator */}
        {isConnecting && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-900/20 border border-amber-700/30">
            <Spinner size="sm" />
            <span className="text-sm text-amber-300">
              {waitingForCampaign ? 'Connected! Waiting for campaign data...' : 'Connecting to host...'}
            </span>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-900/20 border border-red-700/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm text-red-300 font-medium">Connection Failed</p>
              <p className="text-xs text-red-400/70 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Connect button */}
        <Button onClick={handleConnect} disabled={!canConnect || isConnecting} className="w-full py-3 text-lg">
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Button>

        {/* Help text */}
        <div className="border border-dashed border-gray-700 rounded-lg p-5 text-center">
          <p className="text-sm text-gray-500">
            Ask your Dungeon Master for an invite code to join their game. The code is displayed in the lobby when they
            create a session.
          </p>
        </div>
      </div>
    </div>
  )
}
