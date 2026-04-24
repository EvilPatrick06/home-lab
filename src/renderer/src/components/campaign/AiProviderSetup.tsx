import { useCallback, useEffect, useRef, useState } from 'react'
import { AI_PROVIDER_LABELS, AI_PROVIDERS, DEFAULT_OLLAMA_URL } from '../../constants'
import type { AiProviderType } from '../../types/campaign'
import { Button, Card } from '../ui'

type SetupPhase = 'idle' | 'detecting' | 'downloading' | 'installing' | 'starting' | 'pulling' | 'ready' | 'error'

interface CuratedModel {
  id: string
  name: string
  vramMB: number
  desc: string
}

interface CloudModel {
  id: string
  name: string
  desc: string
}

interface AiProviderSetupProps {
  enabled: boolean
  provider: AiProviderType
  model: string
  ollamaUrl: string
  apiKey: string
  onProviderReady: (ready: boolean) => void
  onChange: (data: {
    enabled: boolean
    provider: AiProviderType
    model: string
    ollamaUrl: string
    apiKey: string
  }) => void
}

export default function AiProviderSetup({
  enabled,
  provider,
  model,
  ollamaUrl,
  apiKey,
  onProviderReady,
  onChange
}: AiProviderSetupProps): JSX.Element {
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
  const [cloudModels, setCloudModels] = useState<CloudModel[]>([])
  const [validatingKey, setValidatingKey] = useState(false)
  const [keyValid, setKeyValid] = useState<boolean | null>(null)
  const progressListenerRegistered = useRef(false)

  const isCloud = provider !== 'ollama'

  const isValidUrl = useCallback((url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, [])

  // Load cloud models when provider changes
  useEffect(() => {
    if (!enabled || !isCloud) return
    window.api.ai
      .listCloudModels(provider)
      .then((models: CloudModel[]) => {
        setCloudModels(models)
        if (models.length > 0 && !models.some((m) => m.id === model)) {
          onChange({ enabled, provider, model: models[0].id, ollamaUrl, apiKey })
        }
      })
      .catch(() => setCloudModels([]))
  }, [enabled, provider, isCloud, model, ollamaUrl, apiKey, onChange])

  // Detect Ollama status
  const detectOllamaStatus = useCallback(async () => {
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

      const isModelReady = installed.some((m: string) => m.startsWith(model.split(':')[0]))
      setModelReady(isModelReady)

      if (status.installed && status.running && isModelReady) {
        setSetupPhase('ready')
        onProviderReady(true)
      } else {
        setSetupPhase('idle')
        onProviderReady(false)
      }
    } catch {
      setSetupPhase('idle')
      onProviderReady(false)
    }
  }, [model, onProviderReady])

  useEffect(() => {
    if (!enabled) return

    if (provider === 'ollama') {
      detectOllamaStatus()
      if (!progressListenerRegistered.current) {
        progressListenerRegistered.current = true
        window.api.ai.onOllamaProgress((data) => {
          if (data.type === 'download') setDownloadProgress(data.percent)
          if (data.type === 'pull') setPullProgress(data.percent)
        })
      }
    } else {
      // Cloud providers are "ready" if they have an API key
      if (apiKey) {
        setSetupPhase('ready')
        onProviderReady(true)
      } else {
        setSetupPhase('idle')
        onProviderReady(false)
      }
    }
  }, [enabled, provider, apiKey, detectOllamaStatus, onProviderReady])

  const handleAutoSetup = async (): Promise<void> => {
    setErrorMessage(null)
    try {
      if (!ollamaInstalled) {
        setSetupPhase('downloading')
        setDownloadProgress(0)
        const dlResult = await window.api.ai.downloadOllama()
        if (!dlResult.success) throw new Error(dlResult.error || 'Download failed')
        setSetupPhase('installing')
        const installResult = await window.api.ai.installOllama(dlResult.path!)
        if (!installResult.success) throw new Error(installResult.error || 'Installation failed')
        setOllamaInstalled(true)
      }
      if (!ollamaRunning) {
        setSetupPhase('starting')
        const startResult = await window.api.ai.startOllama()
        if (!startResult.success) throw new Error(startResult.error || 'Failed to start Ollama')
        setOllamaRunning(true)
      }
      if (!modelReady) {
        setSetupPhase('pulling')
        setPullProgress(0)
        const pullResult = await window.api.ai.pullModel(model)
        if (!pullResult.success) throw new Error(pullResult.error || 'Failed to pull model')
        setModelReady(true)
        const installed = await window.api.ai.listInstalledModels()
        setInstalledModels(installed)
      }
      setSetupPhase('ready')
      onProviderReady(true)
    } catch (err) {
      setSetupPhase('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
      onProviderReady(false)
    }
  }

  const handleValidateKey = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setValidatingKey(true)
    setKeyValid(null)
    try {
      const result = await window.api.ai.validateApiKey(provider, apiKey)
      setKeyValid(result.valid)
      if (result.valid) {
        setSetupPhase('ready')
        onProviderReady(true)
      } else {
        setErrorMessage(result.error || 'API key validation failed')
        onProviderReady(false)
      }
    } catch {
      setKeyValid(false)
      setErrorMessage('Failed to validate API key')
      onProviderReady(false)
    } finally {
      setValidatingKey(false)
    }
  }

  const gpuDesc =
    vramMB > 0 ? `NVIDIA GPU detected (${Math.round(vramMB / 1024)} GB VRAM)` : 'No NVIDIA GPU detected (CPU mode)'

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
              onChange={(e) => onChange({ enabled: e.target.checked, provider, model, ollamaUrl, apiKey })}
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
          <>
            {/* Provider Selector */}
            <Card>
              <h3 className="font-medium mb-3">AI Provider</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSetupPhase('idle')
                      setErrorMessage(null)
                      setKeyValid(null)
                      onChange({
                        enabled,
                        provider: p,
                        model: p === 'ollama' ? 'llama3.1' : '',
                        ollamaUrl: p === 'ollama' ? ollamaUrl : DEFAULT_OLLAMA_URL,
                        apiKey: p === provider ? apiKey : ''
                      })
                    }}
                    className={`px-3 py-2 rounded border text-sm text-left transition-colors cursor-pointer ${
                      provider === p
                        ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {AI_PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>

              {/* Cloud provider setup */}
              {isCloud && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">API Key</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => {
                          setKeyValid(null)
                          onChange({ enabled, provider, model, ollamaUrl, apiKey: e.target.value })
                        }}
                        placeholder={`Enter your ${AI_PROVIDER_LABELS[provider]} API key`}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                      />
                      <Button onClick={handleValidateKey} disabled={!apiKey.trim() || validatingKey}>
                        {validatingKey ? 'Checking...' : 'Validate'}
                      </Button>
                    </div>
                    {keyValid === true && <p className="text-green-400 text-xs mt-1">API key is valid</p>}
                    {keyValid === false && (
                      <p className="text-red-400 text-xs mt-1">{errorMessage || 'Invalid API key'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Model</label>
                    <select
                      value={model}
                      onChange={(e) => onChange({ enabled, provider, model: e.target.value, ollamaUrl, apiKey })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                    >
                      {cloudModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Ollama setup */}
              {!isCloud && (
                <div className="space-y-4">
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

                  <div className="mb-4">
                    <label className="block text-sm text-gray-400 mb-1">Model</label>
                    <select
                      value={model}
                      onChange={(e) => {
                        onChange({ enabled, provider, model: e.target.value, ollamaUrl, apiKey })
                        const isReady = installedModels.some((m: string) => m.startsWith(e.target.value.split(':')[0]))
                        setModelReady(isReady)
                        if (!isReady) {
                          setSetupPhase('idle')
                          onProviderReady(false)
                        }
                      }}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                    >
                      {curatedModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.desc}
                          {!modelFitsGpu(m) ? ' (may be slow)' : ''}
                          {installedModels.some((i: string) => i.startsWith(m.id.split(':')[0])) ? ' (installed)' : ''}
                        </option>
                      ))}
                      {installedModels
                        .filter((m: string) => !curatedModels.some((c) => m.startsWith(c.id.split(':')[0])))
                        .map((m: string) => (
                          <option key={m} value={m}>
                            {m} (installed)
                          </option>
                        ))}
                    </select>
                    <p className="text-gray-500 text-xs mt-1">{gpuDesc}</p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Ollama URL</label>
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => onChange({ enabled, provider, model, ollamaUrl: e.target.value, apiKey })}
                      placeholder="http://localhost:11434"
                      className={`w-full bg-gray-800 border rounded px-3 py-2 text-sm focus:outline-none ${
                        ollamaUrl && !isValidUrl(ollamaUrl)
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-700 focus:border-amber-500'
                      }`}
                    />
                    {ollamaUrl && !isValidUrl(ollamaUrl) && (
                      <p className="text-red-400 text-xs mt-1">
                        Please enter a valid URL (e.g. http://localhost:11434)
                      </p>
                    )}
                    <p className="text-gray-500 text-xs mt-1">
                      Default: http://localhost:11434. Change this to point to a remote GPU server.
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

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
