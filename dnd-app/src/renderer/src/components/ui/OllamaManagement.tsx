import { useCallback, useEffect, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { isWebBuild } from '../../utils/platform'
import {
  type ActiveOp,
  AvailableModelList,
  type CuratedModel,
  getPerformanceTier,
  getTierLabel,
  type InstalledModel,
  InstalledModelList,
  type PerformanceTier,
  TIER_STYLES
} from './OllamaModelList'

type _PerformanceTier = PerformanceTier

interface VersionInfo {
  installed: string
  latest?: string
  updateAvailable: boolean
}

export default function OllamaManagement(): JSX.Element {
  const { t } = useT()
  const [ollamaStatus, setOllamaStatus] = useState<{
    installed: boolean
    running: boolean
  } | null>(null)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([])
  const [curatedModels, setCuratedModels] = useState<CuratedModel[]>([])
  const [vram, setVram] = useState<number>(0)
  const [activeOp, setActiveOp] = useState<ActiveOp>(null)
  const [customModelName, setCustomModelName] = useState('')
  const [loading, setLoading] = useState(true)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  // Phase 14d — in-app Ollama install (cross-platform via the 14b path). Indeterminate on
  // Linux (install.sh has no parseable progress), percentage on Windows.
  const [installing, setInstalling] = useState(false)
  const [starting, setStarting] = useState(false)

  const refreshModels = useCallback(async () => {
    try {
      const models = await window.api.ai.listInstalledModelsDetailed()
      setInstalledModels(models)
    } catch {
      // Ollama may not be running
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      const [status, curated, vramInfo] = await Promise.all([
        window.api.ai.detectOllama(),
        window.api.ai.getCuratedModels(),
        window.api.ai.getVram()
      ])
      setOllamaStatus(status)
      setCuratedModels(curated)
      setVram(vramInfo.totalMB)

      if (status.running) {
        await refreshModels()
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }, [refreshModels])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // Register the progress listener with a proper per-listener unsubscribe (05A/05D). The old
  // ref-guard + "cleanup handled by removeAllAiListeners" was false — nothing on the Settings
  // unmount path called that, so every visit leaked a listener (MaxListenersExceededWarning).
  useEffect(() => {
    return window.api.ai.onOllamaProgress((data) => {
      setActiveOp((prev) => {
        if (!prev) return prev
        if (data.type === 'pull' && prev.type === 'pull') {
          return { ...prev, percent: data.percent }
        }
        if (data.type === 'ollama-update' && prev.type === 'ollama-update') {
          return { ...prev, percent: data.percent }
        }
        return prev
      })
    })
  }, [])

  const handleInstall = useCallback(async () => {
    setInstalling(true)
    try {
      const dl = await window.api.ai.downloadOllama()
      if (!dl.success || !dl.path) {
        addToast(dl.error ?? t('ui.ollamaManagement.downloadFailed'), 'error')
        return
      }
      const inst = await window.api.ai.installOllama(dl.path)
      if (!inst.success) {
        addToast(inst.error ?? t('ui.ollamaManagement.installFailed'), 'error')
        return
      }
      addToast(t('ui.ollamaManagement.installed'), 'success')
      await refreshAll()
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('ui.ollamaManagement.installError'), 'error')
    } finally {
      setInstalling(false)
    }
  }, [refreshAll, t])

  const handleStart = useCallback(async () => {
    setStarting(true)
    try {
      await window.api.ai.startOllama()
      addToast(t('ui.ollamaManagement.started'), 'success')
      await refreshAll()
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('ui.ollamaManagement.startFailed'), 'error')
    } finally {
      setStarting(false)
    }
  }, [refreshAll, t])

  const checkForUpdate = useCallback(async () => {
    setCheckingUpdate(true)
    try {
      const result = await window.api.ai.checkOllamaUpdate()
      if (result.success && result.data) {
        setVersionInfo(result.data)
        if (!result.data.updateAvailable) {
          addToast(t('ui.ollamaManagement.upToDate'), 'success')
        }
      } else {
        addToast(result.error ?? t('ui.ollamaManagement.checkUpdatesFailed'), 'error')
      }
    } catch {
      addToast(t('ui.ollamaManagement.checkUpdatesFailed'), 'error')
    } finally {
      setCheckingUpdate(false)
    }
  }, [t])

  const handleUpdateOllama = useCallback(async () => {
    setActiveOp({ type: 'ollama-update', percent: 0 })
    try {
      const result = await window.api.ai.updateOllama()
      if (result.success) {
        addToast(t('ui.ollamaManagement.updateSuccess'), 'success')
        setVersionInfo(null)
        await refreshAll()
      } else {
        addToast(result.error ?? t('ui.ollamaManagement.updateFailed'), 'error')
      }
    } catch {
      addToast(t('ui.ollamaManagement.updateError'), 'error')
    } finally {
      setActiveOp(null)
    }
  }, [refreshAll, t])

  const handlePullModel = useCallback(
    async (modelId: string) => {
      setActiveOp({ type: 'pull', model: modelId, percent: 0 })
      try {
        const result = await window.api.ai.pullModel(modelId)
        if (result.success) {
          addToast(t('ui.ollamaManagement.modelUpToDate', { model: modelId }), 'success')
          await refreshModels()
        } else {
          addToast(result.error ?? t('ui.ollamaManagement.pullFailed', { model: modelId }), 'error')
        }
      } catch {
        addToast(t('ui.ollamaManagement.pullFailed', { model: modelId }), 'error')
      } finally {
        setActiveOp(null)
      }
    },
    [refreshModels, t]
  )

  const handleDeleteModel = useCallback(
    async (modelName: string) => {
      setActiveOp({ type: 'delete', model: modelName })
      try {
        const result = await window.api.ai.deleteModel(modelName)
        if (result.success) {
          addToast(t('ui.ollamaManagement.deleted', { model: modelName }), 'success')
          await refreshModels()
        } else {
          addToast(result.error ?? t('ui.ollamaManagement.deleteFailed', { model: modelName }), 'error')
        }
      } catch {
        addToast(t('ui.ollamaManagement.deleteFailed', { model: modelName }), 'error')
      } finally {
        setActiveOp(null)
      }
    },
    [refreshModels, t]
  )

  const handleUpdateAllModels = useCallback(async () => {
    for (const model of installedModels) {
      setActiveOp({ type: 'pull', model: model.name, percent: 0 })
      try {
        await window.api.ai.pullModel(model.name)
      } catch {
        addToast(t('ui.ollamaManagement.updateModelFailed', { model: model.name }), 'error')
      }
    }
    addToast(t('ui.ollamaManagement.allModelsUpdated'), 'success')
    setActiveOp(null)
    await refreshModels()
  }, [installedModels, refreshModels, t])

  const handleCustomPull = useCallback(async () => {
    const name = customModelName.trim()
    if (!name) return
    setCustomModelName('')
    await handlePullModel(name)
  }, [customModelName, handlePullModel])

  const installedNames = new Set(installedModels.map((m) => m.name.replace(/:latest$/, '')))
  const availableModels = curatedModels.filter(
    (c) => !installedNames.has(c.id) && !installedNames.has(c.id.replace(/:latest$/, ''))
  )

  const isBusy = activeOp !== null

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted">{t('ui.ollamaManagement.detecting')}</span>
      </div>
    )
  }

  if (!ollamaStatus?.installed) {
    // PHASE-45 F4 — a browser tab can't install a native binary, and the
    // page (served from the Pi over HTTPS) can't reach a localhost Ollama.
    // Show an explanatory notice instead of an impossible "Install Ollama".
    if (isWebBuild()) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('ui.ollamaManagement.webLocalAiNotice')}</p>
          <button
            onClick={() => window.open('https://ollama.com', '_blank')}
            className="text-accent hover:underline cursor-pointer text-sm"
          >
            {t('ui.ollamaManagement.ollamaComLink')}
          </button>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {t('ui.ollamaManagement.notInstalledLead')}{' '}
          <button
            onClick={() => window.open('https://ollama.com', '_blank')}
            className="text-accent hover:underline cursor-pointer"
          >
            {t('ui.ollamaManagement.ollamaComLink')}
          </button>
          .
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleInstall}
            disabled={installing}
            className="px-3 py-1.5 text-sm font-medium rounded bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white cursor-pointer transition-colors"
          >
            {installing ? t('ui.ollamaManagement.installingOllama') : t('ui.ollamaManagement.installOllama')}
          </button>
          <button
            onClick={refreshAll}
            disabled={installing}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            {t('ui.ollamaManagement.reCheck')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Status & Version */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${ollamaStatus.running ? 'bg-green-400' : 'bg-gray-500'}`} />
          <span className="text-sm text-gray-300">
            {ollamaStatus.running ? t('ui.ollamaManagement.running') : t('ui.ollamaManagement.stopped')}
          </span>
          {/* Only show a version when one actually resolved. `installed` is the
              string 'unknown' when the version API was unreachable (Ollama
              stopped), which previously rendered a meaningless "vunknown". */}
          {versionInfo && versionInfo.installed !== 'unknown' && (
            <span className="text-xs text-gray-500 font-mono">v{versionInfo.installed}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {versionInfo?.updateAvailable && (
            <span className="text-xs text-accent">
              {t('ui.ollamaManagement.versionAvailable', { version: versionInfo.latest })}
            </span>
          )}
          {versionInfo?.updateAvailable ? (
            <button
              onClick={handleUpdateOllama}
              disabled={isBusy}
              className="px-3 py-1 text-xs rounded-lg bg-amber-600 hover:bg-accent-strong text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {activeOp?.type === 'ollama-update'
                ? t('ui.ollamaManagement.updating', { percent: activeOp.percent })
                : t('ui.ollamaManagement.updateOllama')}
            </button>
          ) : (
            <button
              onClick={checkForUpdate}
              disabled={checkingUpdate || isBusy}
              className="px-3 py-1 text-xs rounded-lg border border-border text-muted hover:border-gray-600 hover:text-gray-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkingUpdate ? t('ui.ollamaManagement.checking') : t('ui.ollamaManagement.checkForUpdates')}
            </button>
          )}
        </div>
      </div>

      {/* Ollama update progress bar */}
      {activeOp?.type === 'ollama-update' && (
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-accent-strong h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${activeOp.percent}%` }}
          />
        </div>
      )}

      {/* VRAM Info */}
      {vram > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-surface-2/40 rounded-lg">
          <span className="text-xs text-muted">{t('ui.ollamaManagement.gpuVram')}</span>
          <div className="flex-1 bg-gray-700 rounded-full h-1.5">
            <div className="bg-accent-strong h-1.5 rounded-full w-full" />
          </div>
          <span className="text-xs text-gray-300 font-mono">{(vram / 1000).toFixed(1)} GB</span>
        </div>
      )}
      {vram === 0 && ollamaStatus.running && (
        <div className="text-xs text-gray-500 px-3 py-2 bg-surface-2/40 rounded-lg">
          {t('ui.ollamaManagement.vramNotDetected')}
        </div>
      )}

      {!ollamaStatus.running && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">{t('ui.ollamaManagement.notRunning')}</div>
          <button
            onClick={handleStart}
            disabled={starting || isBusy}
            className="px-3 py-1 text-xs rounded-lg bg-green-700 hover:bg-green-600 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {starting ? t('ui.ollamaManagement.starting') : t('ui.ollamaManagement.startOllama')}
          </button>
        </div>
      )}

      {ollamaStatus.running && (
        <>
          {/* Recommended Models */}
          {vram > 0 &&
            (() => {
              const recommended = curatedModels
                .filter((m) => {
                  const tier = getPerformanceTier(vram, m.vramMB)
                  return tier === 'optimal' || tier === 'good'
                })
                .filter((m) => !installedNames.has(m.id) && !installedNames.has(m.id.replace(/:latest$/, '')))
              if (recommended.length === 0) return null
              return (
                <div className="px-3 py-2.5 bg-green-900/10 border border-green-800/30 rounded-lg">
                  <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">
                    {t('ui.ollamaManagement.recommendedForGpu')}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {recommended.map((m) => {
                      const tier = getPerformanceTier(vram, m.vramMB)
                      const style = TIER_STYLES[tier]
                      return (
                        <button
                          key={m.id}
                          onClick={() => handlePullModel(m.id)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-surface-2/60 rounded-lg border border-border hover:border-green-600 hover:text-green-400 text-gray-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <span>{m.name}</span>
                          <span className={`text-xs px-1 py-0.5 rounded ${style.className}`}>{getTierLabel(tier)}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {t('ui.ollamaManagement.recommendedHelp', { vram: (vram / 1000).toFixed(1) })}
                  </p>
                </div>
              )
            })()}

          {/* Installed Models — uses extracted InstalledModelList component */}
          <InstalledModelList
            models={installedModels}
            curatedModels={curatedModels}
            activeOp={activeOp}
            isBusy={isBusy}
            vram={vram}
            onPull={handlePullModel}
            onDelete={handleDeleteModel}
            onUpdateAll={handleUpdateAllModels}
          />

          {/* Available Models — uses extracted AvailableModelList component */}
          <AvailableModelList
            models={availableModels}
            activeOp={activeOp}
            isBusy={isBusy}
            vram={vram}
            onPull={handlePullModel}
          />

          {/* Custom Model Pull */}
          <div>
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              {t('ui.ollamaManagement.pullCustomModel')}
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomPull()}
                placeholder={t('ui.ollamaManagement.customModelPlaceholder')}
                disabled={isBusy}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
              />
              <button
                onClick={handleCustomPull}
                disabled={isBusy || !customModelName.trim()}
                className="px-4 py-1.5 text-sm rounded-lg border border-border text-muted hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {t('ui.ollamaManagement.pull')}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1.5">
              {t('ui.ollamaManagement.browseModelsAt')}{' '}
              <button
                onClick={() => window.open('https://ollama.com/library', '_blank')}
                className="text-gray-500 hover:text-accent cursor-pointer"
              >
                {t('ui.ollamaManagement.ollamaLibraryLink')}
              </button>
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// Re-export model list components for consumers that import from OllamaManagement
export { AvailableModelList, InstalledModelList }
