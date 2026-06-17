import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_PROVIDER_MODELS } from '../../../../shared/ai-defaults'
import { AI_PROVIDER_LABELS, AI_PROVIDERS, DEFAULT_OLLAMA_URL } from '../../constants'
import { useT } from '../../i18n'
import type { AiProviderType } from '../../types/campaign'
import { Button, Card } from '../ui'

type SetupPhase = 'idle' | 'detecting' | 'downloading' | 'installing' | 'starting' | 'pulling' | 'ready' | 'error'

/**
 * A curated model counts as installed only on an exact name:tag match. A bare name
 * (no tag) also matches the family default `:latest`. This deliberately does NOT match
 * a different SIZE tag of the same family — the old `startsWith(family)` check wrongly
 * flagged e.g. `llama3.1:70b` as installed whenever `llama3.1:latest` (the 8B) existed.
 */
function isModelInstalled(id: string, installed: string[]): boolean {
  if (installed.includes(id)) return true
  if (!id.includes(':')) return installed.some((m) => m === `${id}:latest` || m.startsWith(`${id}:`))
  return false
}

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
  // PHASE-29 29C/29E — optional routing + local-endpoint controls (absent in callers that don't use them).
  routingEnabled?: boolean
  routingSmallModel?: string
  localEndpointFlavor?: 'ollama' | 'llamacpp'
  onProviderReady: (ready: boolean) => void
  onChange: (data: {
    enabled: boolean
    provider: AiProviderType
    model: string
    ollamaUrl: string
    apiKey: string
    routingEnabled?: boolean
    routingSmallModel?: string
    localEndpointFlavor?: 'ollama' | 'llamacpp'
  }) => void
}

export default function AiProviderSetup({
  enabled,
  provider,
  model,
  ollamaUrl,
  apiKey,
  routingEnabled = false,
  routingSmallModel = '',
  localEndpointFlavor = 'ollama',
  onProviderReady,
  onChange
}: AiProviderSetupProps): JSX.Element {
  const { t } = useT()
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
  // PHASE-10 10G — make the model dropdown communicate loading / error / empty.
  const [cloudModelsState, setCloudModelsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [validatingKey, setValidatingKey] = useState(false)
  const [keyValid, setKeyValid] = useState<boolean | null>(null)
  // PHASE-10 10G — surface a local-AI detection failure instead of leaving gray circles.
  const [detectError, setDetectError] = useState(false)

  const isCloud = provider !== 'ollama'

  const isValidUrl = useCallback((url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, [])

  // Load cloud models when provider changes (extracted so the dropdown's error state has a retry).
  const loadCloudModels = useCallback(async () => {
    if (!enabled || !isCloud) return
    setCloudModelsState('loading')
    try {
      const models = await window.api.ai.listCloudModels(provider, apiKey)
      const normalized: CloudModel[] = models.map((m) => ({ id: m.id, name: m.name, desc: m.desc ?? '' }))
      setCloudModels(normalized)
      setCloudModelsState('ready')
      if (normalized.length > 0 && !normalized.some((m) => m.id === model)) {
        onChange({ enabled, provider, model: normalized[0].id, ollamaUrl, apiKey })
      }
    } catch {
      setCloudModels([])
      setCloudModelsState('error')
    }
  }, [enabled, provider, isCloud, model, ollamaUrl, apiKey, onChange])

  useEffect(() => {
    void loadCloudModels()
  }, [loadCloudModels])

  // Detect Ollama status
  const detectOllamaStatus = useCallback(async () => {
    setSetupPhase('detecting')
    setErrorMessage(null)
    setDetectError(false)
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

      const isModelReady = isModelInstalled(model, installed)
      setModelReady(isModelReady)

      if (status.installed && status.running && isModelReady) {
        setSetupPhase('ready')
        onProviderReady(true)
      } else {
        setSetupPhase('idle')
        onProviderReady(false)
      }
    } catch {
      // The dedicated detect-error block (below) renders the message + retry; don't also
      // set errorMessage (the generic setup-error line would duplicate it).
      setSetupPhase('idle')
      setDetectError(true)
      onProviderReady(false)
    }
  }, [model, onProviderReady])

  useEffect(() => {
    if (!enabled) return

    if (provider === 'ollama') {
      detectOllamaStatus()
    } else {
      // PHASE-10 10G — cloud readiness means the key is VALIDATED, not just non-empty.
      // A garbage key no longer passes the wizard's Next gate (CampaignWizard reads
      // onProviderReady). The debounced auto-validate effect below flips keyValid.
      if (!apiKey) {
        setSetupPhase('idle')
        onProviderReady(false)
      } else {
        onProviderReady(keyValid === true)
        setSetupPhase(keyValid === true ? 'ready' : 'idle')
      }
    }
  }, [enabled, provider, apiKey, keyValid, detectOllamaStatus, onProviderReady])

  // Ollama download/pull progress — dedicated effect with a per-listener unsubscribe (05A/05D),
  // so each wizard mount registers exactly one listener and detaches it on unmount.
  useEffect(() => {
    if (!enabled || provider !== 'ollama') return undefined
    return window.api.ai.onOllamaProgress((data) => {
      if (data.type === 'download') setDownloadProgress(data.percent)
      if (data.type === 'pull') setPullProgress(data.percent)
    })
  }, [enabled, provider])

  // AI-3 — recognize an already-installed model as ready without re-pulling. When
  // the Ollama provider is selected and the current model isn't installed but
  // another model IS, switch the selection to an installed model (preferring a
  // curated one). Changing `model` re-runs detectOllamaStatus, which then marks
  // readiness + enables Next. Idempotent: once `model` is installed the guard
  // returns early. Kept separate from detectOllamaStatus (which runs IPC) so it
  // never re-triggers detection.
  useEffect(() => {
    if (provider !== 'ollama' || installedModels.length === 0) return
    const isInstalled = (id: string): boolean => isModelInstalled(id, installedModels)
    if (isInstalled(model)) return
    const next = curatedModels.find((c) => isInstalled(c.id))?.id ?? installedModels[0]
    if (next && next !== model) {
      onChange({ enabled, provider, model: next, ollamaUrl, apiKey })
    }
  }, [installedModels, curatedModels, model, provider, enabled, ollamaUrl, apiKey, onChange])

  const handleAutoSetup = async (): Promise<void> => {
    setErrorMessage(null)
    try {
      if (!ollamaInstalled) {
        setSetupPhase('downloading')
        setDownloadProgress(0)
        const dlResult = await window.api.ai.downloadOllama()
        if (!dlResult.success) throw new Error(dlResult.error || t('campaign.aiProviderSetup.errorDownload'))
        setSetupPhase('installing')
        const installResult = await window.api.ai.installOllama(dlResult.path!)
        if (!installResult.success) throw new Error(installResult.error || t('campaign.aiProviderSetup.errorInstall'))
        setOllamaInstalled(true)
      }
      if (!ollamaRunning) {
        setSetupPhase('starting')
        const startResult = await window.api.ai.startOllama()
        if (!startResult.success) throw new Error(startResult.error || t('campaign.aiProviderSetup.errorStart'))
        setOllamaRunning(true)
      }
      if (!modelReady) {
        setSetupPhase('pulling')
        setPullProgress(0)
        const pullResult = await window.api.ai.pullModel(model)
        if (!pullResult.success) throw new Error(pullResult.error || t('campaign.aiProviderSetup.errorPull'))
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

  const handleValidateKey = useCallback(async (): Promise<void> => {
    if (!apiKey.trim()) return
    setValidatingKey(true)
    setKeyValid(null)
    try {
      const result = await window.api.ai.validateApiKey(provider, apiKey)
      setKeyValid(result.valid ?? null)
      if (result.valid) {
        setSetupPhase('ready')
        onProviderReady(true)
      } else {
        setErrorMessage(result.error || t('campaign.aiProviderSetup.errorKeyValidation'))
        onProviderReady(false)
      }
    } catch {
      setKeyValid(false)
      setErrorMessage(t('campaign.aiProviderSetup.errorKeyValidationFailed'))
      onProviderReady(false)
    } finally {
      setValidatingKey(false)
    }
  }, [apiKey, provider, onProviderReady, t])

  // PHASE-10 10G — debounced auto-validation: each key edit resets keyValid to null
  // (the field's onChange), re-arming exactly one validation 600ms later. The manual
  // Validate button stays for explicit re-checks.
  useEffect(() => {
    if (!enabled || !isCloud || !apiKey.trim() || keyValid !== null || validatingKey) return
    const id = setTimeout(() => {
      void handleValidateKey()
    }, 600)
    return () => clearTimeout(id)
  }, [enabled, isCloud, apiKey, keyValid, validatingKey, handleValidateKey])

  const gpuDesc =
    vramMB > 0
      ? t('campaign.aiProviderSetup.gpuDetected', { gb: Math.round(vramMB / 1024) })
      : t('campaign.aiProviderSetup.gpuNotDetected')

  const modelFitsGpu = (m: CuratedModel): boolean => vramMB === 0 || m.vramMB <= vramMB
  const isSetupBusy = ['downloading', 'installing', 'starting', 'pulling'].includes(setupPhase)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">{t('campaign.aiProviderSetup.title')}</h2>
      <p className="text-muted text-sm mb-6">{t('campaign.aiProviderSetup.subtitle')}</p>

      <div className="max-w-2xl space-y-4">
        {/* Enable toggle */}
        <Card>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onChange({ enabled: e.target.checked, provider, model, ollamaUrl, apiKey })}
              className="w-5 h-5 rounded bg-surface-2 border-gray-600 text-accent-strong focus:ring-amber-500"
            />
            <div>
              <span className="font-medium">{t('campaign.aiProviderSetup.enable')}</span>
              <p className="text-muted text-sm mt-0.5">{t('campaign.aiProviderSetup.enableDesc')}</p>
            </div>
          </label>
        </Card>

        {enabled && (
          <>
            {/* Provider Selector */}
            <Card>
              <h3 className="font-medium mb-3">{t('campaign.aiProviderSetup.provider')}</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSetupPhase('idle')
                      setErrorMessage(null)
                      setKeyValid(null)
                      // Sensible default model per provider — single source of truth (PHASE-10 10A)
                      onChange({
                        enabled,
                        provider: p,
                        model: DEFAULT_PROVIDER_MODELS[p as keyof typeof DEFAULT_PROVIDER_MODELS] ?? '',
                        ollamaUrl: p === 'ollama' ? ollamaUrl : DEFAULT_OLLAMA_URL,
                        apiKey: p === provider ? apiKey : ''
                      })
                    }}
                    className={`px-3 py-2 rounded border text-sm text-left transition-colors cursor-pointer ${
                      provider === p
                        ? 'border-amber-500 bg-accent-strong/10 text-amber-300'
                        : 'border-border bg-surface-2 text-muted hover:border-gray-500'
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
                    <label htmlFor="ai-api-key" className="block text-sm text-muted mb-1">
                      {t('campaign.aiProviderSetup.apiKey')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="ai-api-key"
                        type="password"
                        value={apiKey}
                        aria-invalid={keyValid === false}
                        aria-describedby={keyValid !== null ? 'ai-api-key-status' : undefined}
                        onChange={(e) => {
                          setKeyValid(null)
                          onChange({ enabled, provider, model, ollamaUrl, apiKey: e.target.value })
                        }}
                        placeholder={t('campaign.aiProviderSetup.apiKeyPlaceholder', {
                          provider: AI_PROVIDER_LABELS[provider]
                        })}
                        className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                      />
                      <Button onClick={handleValidateKey} disabled={!apiKey.trim() || validatingKey}>
                        {validatingKey
                          ? t('campaign.aiProviderSetup.checking')
                          : t('campaign.aiProviderSetup.validate')}
                      </Button>
                    </div>
                    {keyValid === true && (
                      <p id="ai-api-key-status" role="status" className="text-green-400 text-xs mt-1">
                        {t('campaign.aiProviderSetup.apiKeyValid')}
                      </p>
                    )}
                    {keyValid === false && (
                      <p id="ai-api-key-status" role="alert" className="text-red-400 text-xs mt-1">
                        {errorMessage || t('campaign.aiProviderSetup.apiKeyInvalid')}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm text-muted mb-1">{t('campaign.aiProviderSetup.model')}</label>
                    {cloudModelsState === 'loading' ? (
                      <select
                        disabled
                        className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm opacity-60"
                      >
                        <option>{t('campaign.aiProviderSetup.modelsLoading')}</option>
                      </select>
                    ) : (
                      <select
                        value={model}
                        onChange={(e) => onChange({ enabled, provider, model: e.target.value, ollamaUrl, apiKey })}
                        className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                      >
                        {cloudModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.desc ? `${m.name} — ${m.desc}` : m.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {cloudModelsState === 'error' && (
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-red-400 text-xs">{t('campaign.aiProviderSetup.modelsError')}</p>
                        <button
                          type="button"
                          onClick={() => void loadCloudModels()}
                          className="text-xs text-amber-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          {t('campaign.aiProviderSetup.retryDetect')}
                        </button>
                      </div>
                    )}
                    {cloudModelsState === 'ready' && cloudModels.length === 0 && (
                      <p className="text-muted text-xs mt-1">{t('campaign.aiProviderSetup.modelsEmpty')}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Ollama setup */}
              {!isCloud && (
                <div className="space-y-4">
                  {/* PHASE-29 29E — local endpoint flavor: stock Ollama (default) or a llama.cpp
                      llama-server (experimental; manual launch — see docs/LLAMA-SERVER.md). */}
                  <div>
                    <label className="block text-sm text-muted mb-1">
                      {t('campaign.aiProviderSetup.localEndpointLabel')}
                    </label>
                    <select
                      value={localEndpointFlavor}
                      onChange={(e) =>
                        onChange({
                          enabled,
                          provider,
                          model,
                          ollamaUrl,
                          apiKey,
                          localEndpointFlavor: e.target.value as 'ollama' | 'llamacpp'
                        })
                      }
                      className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                    >
                      <option value="ollama">{t('campaign.aiProviderSetup.localEndpointOllama')}</option>
                      <option value="llamacpp">{t('campaign.aiProviderSetup.localEndpointLlamacpp')}</option>
                    </select>
                    {localEndpointFlavor === 'llamacpp' && (
                      <p className="text-gray-500 text-xs mt-1">{t('campaign.aiProviderSetup.localEndpointHint')}</p>
                    )}
                  </div>

                  {/* The Ollama-binary detect/install wizard + curated picker only apply to the
                      'ollama' flavor; a llama-server is launched manually (URL field below). */}
                  {localEndpointFlavor === 'ollama' && (
                    <>
                      <div className="space-y-2 mb-4">
                        <StatusItem
                          label={t('campaign.aiProviderSetup.statusInstalled')}
                          done={ollamaInstalled}
                          active={setupPhase === 'downloading' || setupPhase === 'installing'}
                          progress={setupPhase === 'downloading' ? downloadProgress : undefined}
                          phaseLabel={
                            setupPhase === 'downloading'
                              ? t('campaign.aiProviderSetup.downloading', { percent: downloadProgress })
                              : setupPhase === 'installing'
                                ? t('campaign.aiProviderSetup.installing')
                                : undefined
                          }
                        />
                        <StatusItem
                          label={t('campaign.aiProviderSetup.statusRunning')}
                          done={ollamaRunning}
                          active={setupPhase === 'starting'}
                          phaseLabel={
                            setupPhase === 'starting' ? t('campaign.aiProviderSetup.startingServer') : undefined
                          }
                        />
                        <StatusItem
                          label={t('campaign.aiProviderSetup.statusModelReady')}
                          done={modelReady}
                          active={setupPhase === 'pulling'}
                          progress={setupPhase === 'pulling' ? pullProgress : undefined}
                          phaseLabel={
                            setupPhase === 'pulling'
                              ? t('campaign.aiProviderSetup.pullingModel', { percent: pullProgress })
                              : undefined
                          }
                        />
                      </div>

                      {/* PHASE-10 10G — visible, retryable detection failure (distinct from "nothing installed yet"). */}
                      {detectError && (
                        <div className="mb-4 rounded border border-red-700/40 bg-red-900/20 p-3">
                          <p className="text-red-400 text-sm mb-2">{t('campaign.aiProviderSetup.errorDetect')}</p>
                          <Button onClick={() => void detectOllamaStatus()} disabled={setupPhase === 'detecting'}>
                            {t('campaign.aiProviderSetup.retryDetect')}
                          </Button>
                        </div>
                      )}

                      {setupPhase !== 'ready' && (
                        <div className="mb-4">
                          {errorMessage && <p className="text-red-400 text-sm mb-2">{errorMessage}</p>}
                          <Button onClick={handleAutoSetup} disabled={isSetupBusy || setupPhase === 'detecting'}>
                            {isSetupBusy
                              ? t('campaign.aiProviderSetup.settingUp')
                              : setupPhase === 'error'
                                ? t('campaign.aiProviderSetup.retrySetup')
                                : setupPhase === 'detecting'
                                  ? t('campaign.aiProviderSetup.detecting')
                                  : !ollamaInstalled
                                    ? t('campaign.aiProviderSetup.installSetup')
                                    : !ollamaRunning
                                      ? t('campaign.aiProviderSetup.startSetup')
                                      : t('campaign.aiProviderSetup.pullModel')}
                          </Button>
                        </div>
                      )}

                      {setupPhase === 'ready' && (
                        <p className="text-green-400 text-sm mb-4">{t('campaign.aiProviderSetup.readyToGo')}</p>
                      )}

                      <div className="mb-4">
                        <label className="block text-sm text-muted mb-1">{t('campaign.aiProviderSetup.model')}</label>
                        <select
                          value={model}
                          onChange={(e) => {
                            onChange({ enabled, provider, model: e.target.value, ollamaUrl, apiKey })
                            const isReady = isModelInstalled(e.target.value, installedModels)
                            setModelReady(isReady)
                            if (!isReady) {
                              setSetupPhase('idle')
                              onProviderReady(false)
                            }
                          }}
                          className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                        >
                          {curatedModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} — {m.desc}
                              {!modelFitsGpu(m) ? t('campaign.aiProviderSetup.mayBeSlow') : ''}
                              {isModelInstalled(m.id, installedModels)
                                ? t('campaign.aiProviderSetup.installedSuffix')
                                : ''}
                            </option>
                          ))}
                          {installedModels
                            .filter((m: string) => !curatedModels.some((c) => isModelInstalled(c.id, [m])))
                            .map((m: string) => (
                              <option key={m} value={m}>
                                {t('campaign.aiProviderSetup.installedModelOption', { model: m })}
                              </option>
                            ))}
                        </select>
                        <p className="text-gray-500 text-xs mt-1">{gpuDesc}</p>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm text-muted mb-1">{t('campaign.aiProviderSetup.ollamaUrl')}</label>
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => onChange({ enabled, provider, model, ollamaUrl: e.target.value, apiKey })}
                      placeholder="http://localhost:11434"
                      className={`w-full bg-surface-2 border rounded px-3 py-2 text-sm focus:outline-none ${
                        ollamaUrl && !isValidUrl(ollamaUrl)
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-border focus:border-amber-500'
                      }`}
                    />
                    {ollamaUrl && !isValidUrl(ollamaUrl) && (
                      <p className="text-red-400 text-xs mt-1">{t('campaign.aiProviderSetup.invalidUrl')}</p>
                    )}
                    <p className="text-gray-500 text-xs mt-1">{t('campaign.aiProviderSetup.urlHint')}</p>
                  </div>
                </div>
              )}
            </Card>

            {/* PHASE-29 29C — Advanced: route background tasks (summaries, extraction, mechanics —
                NOT narration) to a smaller/faster model. Off by default. */}
            <div className="mt-4 border-t border-border/40 pt-3">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={routingEnabled}
                  onChange={(e) =>
                    onChange({
                      enabled,
                      provider,
                      model,
                      ollamaUrl,
                      apiKey,
                      routingEnabled: e.target.checked,
                      routingSmallModel
                    })
                  }
                />
                {t('campaign.aiProviderSetup.routingEnabled')}
              </label>
              <p className="text-gray-500 text-xs mt-0.5 ml-6">{t('campaign.aiProviderSetup.routingHint')}</p>
              {routingEnabled && (
                <div className="ml-6 mt-2">
                  <label className="block text-xs text-muted mb-1">
                    {t('campaign.aiProviderSetup.routingSmallModel')}
                  </label>
                  <select
                    value={routingSmallModel}
                    onChange={(e) =>
                      onChange({
                        enabled,
                        provider,
                        model,
                        ollamaUrl,
                        apiKey,
                        routingEnabled,
                        routingSmallModel: e.target.value
                      })
                    }
                    className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
                  >
                    <option value="">{t('campaign.aiProviderSetup.routingSmallModelNone')}</option>
                    {(isCloud
                      ? cloudModels.map((m) => ({ id: m.id, name: m.name }))
                      : installedModels.map((m) => ({ id: m, name: m }))
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
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
              ? 'border-amber-500 bg-accent-strong/20 text-accent animate-pulse'
              : 'border-gray-600 text-gray-600'
        }`}
      >
        {done ? '\u2713' : active ? '\u2022' : ''}
      </span>
      <span className={`text-sm ${done ? 'text-green-400' : active ? 'text-accent' : 'text-muted'}`}>
        {phaseLabel || label}
      </span>
      {active && progress !== undefined && (
        <div className="flex-1 max-w-32 h-1.5 bg-gray-700 rounded-full overflow-hidden ml-2">
          <div className="h-full bg-accent-strong rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
