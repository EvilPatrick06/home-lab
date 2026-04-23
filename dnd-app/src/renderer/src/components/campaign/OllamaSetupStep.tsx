import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card } from '../ui'

type SetupPhase = 'idle' | 'detecting' | 'downloading' | 'installing' | 'starting' | 'pulling' | 'ready' | 'error'

interface CuratedModel {
  id: string
  name: string
  vramMB: number
  desc: string
}

interface OllamaSetupStepProps {
  enabled: boolean
  ollamaModel: string
  ollamaUrl: string
  onOllamaReady: (ready: boolean) => void
  onChange: (data: { enabled: boolean; ollamaModel: string; ollamaUrl: string }) => void
}

export default function OllamaSetupStep({
  enabled,
  ollamaModel,
  ollamaUrl,
  onOllamaReady,
  onChange
}: OllamaSetupStepProps): JSX.Element {
  // Ollama state
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('idle')
  const [ollamaInstalled, setOllamaInstalled] = useState(false)
  const [ollamaRunning, setOllamaRunning] = useState(false)
  const [modelReady, setModelReady] = useState(false)
  const [vramMB, setVramMB] = useState(0)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [pullProgress, setPullProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [curatedModels, setCuratedModels] = useState<CuratedModel[]>([])
  const [installedModels, setInstalledModels] = useState<string[]>([])
  const progressListenerRegistered = useRef(false)

  // Validate Ollama URL format
  const isValidUrl = useCallback((url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, [])

  // Detect Ollama status
  const detectStatus = useCallback(async () => {
    setSetupPhase('detecting')
    setErrorMessage(null)
    try {
      const [status, vram, models, installed] = await Promise.all([
        window.api.ai.detectOllama(),
        window.api.ai.getVram(),
        window.api.ai.getCuratedModels(),
        window.api.ai.listInstalledModels()
      ])
      setOllamaInstalled(status.installed)
      setOllamaRunning(status.running)
      setVramMB(vram.totalMB)
      setCuratedModels(models)
      setInstalledModels(installed)

      // Check if selected model is already installed
      const isModelReady = installed.some((m) => m.startsWith(ollamaModel.split(':')[0]))
      setModelReady(isModelReady)

      if (status.installed && status.running && isModelReady) {
        setSetupPhase('ready')
        onOllamaReady(true)
      } else {
        setSetupPhase('idle')
        onOllamaReady(false)
      }
    } catch {
      setSetupPhase('idle')
      onOllamaReady(false)
    }
  }, [ollamaModel, onOllamaReady])

  useEffect(() => {
    if (enabled) {
      detectStatus()

      // Register progress listener only once to avoid accumulation on re-renders
      if (!progressListenerRegistered.current) {
        progressListenerRegistered.current = true
        window.api.ai.onOllamaProgress((data) => {
          if (data.type === 'download') setDownloadProgress(data.percent)
          if (data.type === 'pull') setPullProgress(data.percent)
        })
      }
    }
  }, [enabled, detectStatus])

  // Auto-setup flow
  const handleAutoSetup = async (): Promise<void> => {
    setErrorMessage(null)
    try {
      // Step 1: Download (if not installed)
      if (!ollamaInstalled) {
        setSetupPhase('downloading')
        setDownloadProgress(0)
        const dlResult = await window.api.ai.downloadOllama()
        if (!dlResult.success) {
          throw new Error(dlResult.error || 'Download failed')
        }

        // Step 2: Install
        setSetupPhase('installing')
        const installResult = await window.api.ai.installOllama(dlResult.path!)
        if (!installResult.success) {
          throw new Error(installResult.error || 'Installation failed')
        }
        setOllamaInstalled(true)
      }

      // Step 3: Start (if not running)
      if (!ollamaRunning) {
        setSetupPhase('starting')
        const startResult = await window.api.ai.startOllama()
        if (!startResult.success) {
          throw new Error(startResult.error || 'Failed to start Ollama')
        }
        setOllamaRunning(true)
      }

      // Step 4: Pull model (if not ready)
      if (!modelReady) {
        setSetupPhase('pulling')
        setPullProgress(0)
        const pullResult = await window.api.ai.pullModel(ollamaModel)
        if (!pullResult.success) {
          throw new Error(pullResult.error || 'Failed to pull model')
        }
        setModelReady(true)

        // Refresh installed models list
        const installed = await window.api.ai.listInstalledModels()
        setInstalledModels(installed)
      }

      setSetupPhase('ready')
      onOllamaReady(true)
    } catch (err) {
      setSetupPhase('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
      onOllamaReady(false)
    }
  }

  // GPU description
  const gpuDesc =
    vramMB > 0 ? `NVIDIA GPU detected (${Math.round(vramMB / 1024)} GB VRAM)` : 'No NVIDIA GPU detected (CPU mode)'

  // Which curated models can this GPU run
  const modelFitsGpu = (m: CuratedModel): boolean => vramMB === 0 || m.vramMB <= vramMB

  const isSetupBusy = ['downloading', 'installing', 'starting', 'pulling'].includes(setupPhase)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">AI Dungeon Master</h2>
      <p className="text-gray-400 text-sm mb-6">Optionally enable an AI-powered Dungeon Master for your campaign.</p>

      <div className="max-w-2xl space-y-4">
        {/* Enable toggle */}
        <Card>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) =>
                onChange({
                  enabled: e.target.checked,
                  ollamaModel,
                  ollamaUrl
                })
              }
              className="w-5 h-5 rounded bg-gray-800 border-gray-600 text-amber-500 focus:ring-amber-500"
            />
            <div>
              <span className="font-medium">Enable AI Dungeon Master</span>
              <p className="text-gray-400 text-sm mt-0.5">
                The AI will narrate scenes, run combat, manage NPCs, and track character stats. You keep full DM
                controls and can override at any time.
              </p>
            </div>
          </label>
        </Card>

        {enabled && (
          <Card>
            <h3 className="font-medium mb-3">Ollama Setup</h3>

            {/* Status checklist */}
            <div className="space-y-2 mb-4">
              <StatusItem
                label="Ollama installed"
                done={ollamaInstalled}
                active={setupPhase === 'downloading' || setupPhase === 'installing'}
                progress={setupPhase === 'downloading' ? downloadProgress : undefined}
                phaseLabel={
                  setupPhase === 'downloading'
                    ? `Downloading... ${downloadProgress}%`
                    : setupPhase === 'installing'
                      ? 'Installing...'
                      : undefined
                }
              />
              <StatusItem
                label="Ollama running"
                done={ollamaRunning}
                active={setupPhase === 'starting'}
                phaseLabel={setupPhase === 'starting' ? 'Starting server...' : undefined}
              />
              <StatusItem
                label="Model ready"
                done={modelReady}
                active={setupPhase === 'pulling'}
                progress={setupPhase === 'pulling' ? pullProgress : undefined}
                phaseLabel={setupPhase === 'pulling' ? `Pulling model... ${pullProgress}%` : undefined}
              />
            </div>

            {/* Setup / Retry button */}
            {setupPhase !== 'ready' && (
              <div className="mb-4">
                {errorMessage && <p className="text-red-400 text-sm mb-2">{errorMessage}</p>}
                <Button onClick={handleAutoSetup} disabled={isSetupBusy || setupPhase === 'detecting'}>
                  {isSetupBusy
                    ? 'Setting up...'
                    : setupPhase === 'error'
                      ? 'Retry Setup'
                      : setupPhase === 'detecting'
                        ? 'Detecting...'
                        : !ollamaInstalled
                          ? 'Install & Setup'
                          : !ollamaRunning
                            ? 'Start & Setup'
                            : 'Pull Model'}
                </Button>
              </div>
            )}

            {setupPhase === 'ready' && <p className="text-green-400 text-sm mb-4">Ready to go!</p>}

            {/* Model selector */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Model</label>
              <select
                value={ollamaModel}
                onChange={(e) => {
                  onChange({ enabled, ollamaModel: e.target.value, ollamaUrl })
                  // Check if newly selected model is already installed
                  const isReady = installedModels.some((m) => m.startsWith(e.target.value.split(':')[0]))
                  setModelReady(isReady)
                  if (!isReady) {
                    setSetupPhase('idle')
                    onOllamaReady(false)
                  }
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
              >
                {curatedModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.desc}
                    {!modelFitsGpu(m) ? ' (may be slow)' : ''}
                    {installedModels.some((i) => i.startsWith(m.id.split(':')[0])) ? ' (installed)' : ''}
                  </option>
                ))}
                {/* Show installed models not in curated list */}
                {installedModels
                  .filter((m) => !curatedModels.some((c) => m.startsWith(c.id.split(':')[0])))
                  .map((m) => (
                    <option key={m} value={m}>
                      {m} (installed)
                    </option>
                  ))}
              </select>
              <p className="text-gray-500 text-xs mt-1">{gpuDesc}</p>
            </div>

            {/* Ollama URL */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ollama URL</label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => onChange({ enabled, ollamaModel, ollamaUrl: e.target.value })}
                placeholder="http://localhost:11434"
                className={`w-full bg-gray-800 border rounded px-3 py-2 text-sm focus:outline-none ${
                  ollamaUrl && !isValidUrl(ollamaUrl)
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-700 focus:border-amber-500'
                }`}
              />
              {ollamaUrl && !isValidUrl(ollamaUrl) && (
                <p className="text-red-400 text-xs mt-1">Please enter a valid URL (e.g. http://localhost:11434)</p>
              )}
              <p className="text-gray-500 text-xs mt-1">
                Default: http://localhost:11434. Change this to point to a remote GPU server.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

/** Status checklist item */
function StatusItem({
  label,
  done,
  active,
  progress,
  phaseLabel
}: {
  label: string
  done: boolean
  active?: boolean
  progress?: number
  phaseLabel?: string
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${
          done
            ? 'border-green-500 bg-green-500/20 text-green-400'
            : active
              ? 'border-amber-500 bg-amber-500/20 text-amber-400 animate-pulse'
              : 'border-gray-600 text-gray-600'
        }`}
      >
        {done ? '\u2713' : active ? '\u2022' : ''}
      </span>
      <span className={`text-sm ${done ? 'text-green-400' : active ? 'text-amber-400' : 'text-gray-400'}`}>
        {phaseLabel || label}
      </span>
      {active && progress !== undefined && (
        <div className="flex-1 max-w-32 h-1.5 bg-gray-700 rounded-full overflow-hidden ml-2">
          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
