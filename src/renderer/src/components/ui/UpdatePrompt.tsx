import { useEffect, useState } from 'react'
import { logger } from '../../utils/logger'

const DISMISSED_KEY = 'dnd-vtt-update-dismissed'

type Stage = 'hidden' | 'prompt' | 'downloading' | 'ready'

export default function UpdatePrompt(): JSX.Element | null {
  const [stage, setStage] = useState<Stage>('hidden')
  const [version, setVersion] = useState<string | null>(null)
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    // Only check once per app launch — skip if already dismissed this session
    const dismissed = sessionStorage.getItem(DISMISSED_KEY)

    window.api.update.onStatus((status) => {
      if (status.state === 'available' && status.version) {
        // Don't re-prompt for a version dismissed this session
        if (dismissed === status.version) return
        setVersion(status.version)
        setStage('prompt')
      } else if (status.state === 'downloading') {
        setStage('downloading')
        setPercent(status.percent ?? 0)
      } else if (status.state === 'downloaded') {
        if (status.version) setVersion(status.version)
        setStage('ready')
      } else if (status.state === 'error') {
        logger.warn('[UpdatePrompt] Update check error:', status.message)
        setStage('hidden')
      }
    })

    // Fire the check after a short delay so the window is fully loaded
    const timer = setTimeout(() => {
      window.api.update.checkForUpdates().catch((e: unknown) => {
        logger.warn('[UpdatePrompt] Startup update check failed:', e)
      })
    }, 3000)

    return () => {
      clearTimeout(timer)
      // Don't call removeStatusListener — it removes ALL listeners including
      // those registered by other components (e.g. AboutPage). This component
      // lives for the entire app lifetime so cleanup is not needed.
    }
  }, [])

  if (stage === 'hidden') return null

  const handleUpdateNow = (): void => {
    if (stage === 'prompt') {
      setStage('downloading')
      setPercent(0)
      window.api.update.downloadUpdate().catch((e: unknown) => {
        logger.error('[UpdatePrompt] Download failed:', e)
        setStage('hidden')
      })
    } else if (stage === 'ready') {
      window.api.update.installUpdate()
    }
  }

  const handleLater = (): void => {
    if (version) {
      sessionStorage.setItem(DISMISSED_KEY, version)
    }
    setStage('hidden')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold mb-2">Update Available</h3>

        {stage === 'prompt' && (
          <>
            <p className="text-gray-400 text-sm mb-4">Version {version} is available. Would you like to update now?</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleLater}
                className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800
                  transition-colors cursor-pointer text-sm"
              >
                Update Later
              </button>
              <button
                onClick={handleUpdateNow}
                className="px-4 py-2 rounded-lg transition-colors cursor-pointer text-sm
                  font-semibold text-white bg-amber-600 hover:bg-amber-500"
              >
                Update Now
              </button>
            </div>
          </>
        )}

        {stage === 'downloading' && (
          <>
            <p className="text-gray-400 text-sm mb-3">Downloading update...</p>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-1">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">{percent}%</p>
          </>
        )}

        {stage === 'ready' && (
          <>
            <p className="text-gray-400 text-sm mb-4">Version {version} is ready to install. The app will restart.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleLater}
                className="px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800
                  transition-colors cursor-pointer text-sm"
              >
                Later
              </button>
              <button
                onClick={handleUpdateNow}
                className="px-4 py-2 rounded-lg transition-colors cursor-pointer text-sm
                  font-semibold text-white bg-green-600 hover:bg-green-500"
              >
                Restart &amp; Update
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
