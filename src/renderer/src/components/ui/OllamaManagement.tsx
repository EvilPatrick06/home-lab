import { useCallback, useEffect, useRef, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import {
  type ActiveOp,
  AvailableModelList,
  type CuratedModel,
  getPerformanceTier,
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
  const progressListenerSet = useRef(false)

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

  useEffect(() => {
    if (progressListenerSet.current) return
    progressListenerSet.current = true

    window.api.ai.onOllamaProgress((data) => {
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

    return () => {
      // Listener cleanup handled by removeAllAiListeners when page unmounts
    }
  }, [])

  const checkForUpdate = useCallback(async () => {
    setCheckingUpdate(true)
    try {
      const result = await window.api.ai.checkOllamaUpdate()
      if (result.success && result.data) {
        setVersionInfo(result.data)
        if (!result.data.updateAvailable) {
          addToast('Ollama is up to date', 'success')
        }
      } else {
        addToast(result.error ?? 'Failed to check for updates', 'error')
      }
    } catch {
      addToast('Failed to check for updates', 'error')
    } finally {
      setCheckingUpdate(false)
    }
  }, [])

  const handleUpdateOllama = useCallback(async () => {
    setActiveOp({ type: 'ollama-update', percent: 0 })
    try {
      const result = await window.api.ai.updateOllama()
      if (result.success) {
        addToast('Ollama updated successfully! Restart Ollama to use the new version.', 'success')
        setVersionInfo(null)
        await refreshAll()
      } else {
        addToast(result.error ?? 'Update failed', 'error')
      }
    } catch {
      addToast('Ollama update failed', 'error')
    } finally {
      setActiveOp(null)
    }
  }, [refreshAll])

  const handlePullModel = useCallback(
    async (modelId: string) => {
      setActiveOp({ type: 'pull', model: modelId, percent: 0 })
      try {
        const result = await window.api.ai.pullModel(modelId)
        if (result.success) {
          addToast(`Model ${modelId} is up to date`, 'success')
          await refreshModels()
        } else {
          addToast(result.error ?? `Failed to pull ${modelId}`, 'error')
        }
      } catch {
        addToast(`Failed to pull ${modelId}`, 'error')
      } finally {
        setActiveOp(null)
      }
    },
    [refreshModels]
  )

  const handleDeleteModel = useCallback(
    async (modelName: string) => {
      setActiveOp({ type: 'delete', model: modelName })
      try {
        const result = await window.api.ai.deleteModel(modelName)
        if (result.success) {
          addToast(`Deleted ${modelName}`, 'success')
          await refreshModels()
        } else {
          addToast(result.error ?? `Failed to delete ${modelName}`, 'error')
        }
      } catch {
        addToast(`Failed to delete ${modelName}`, 'error')
      } finally {
        setActiveOp(null)
      }
    },
    [refreshModels]
  )

  const handleUpdateAllModels = useCallback(async () => {
    for (const model of installedModels) {
      setActiveOp({ type: 'pull', model: model.name, percent: 0 })
      try {
        await window.api.ai.pullModel(model.name)
      } catch {
        addToast(`Failed to update ${model.name}`, 'error')
      }
    }
    addToast('All models updated', 'success')
    setActiveOp(null)
    await refreshModels()
  }, [installedModels, refreshModels])

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
        <span className="text-sm text-gray-400">Detecting Ollama...</span>
      </div>
    )
  }

  if (!ollamaStatus?.installed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400">
          Ollama is not installed. Install it during campaign setup, or visit{' '}
          <button
            onClick={() => window.open('https://ollama.com', '_blank')}
            className="text-amber-400 hover:underline cursor-pointer"
          >
            ollama.com
          </button>
          .
        </p>
        <button
          onClick={refreshAll}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
        >
          Re-check
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Status & Version */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${ollamaStatus.running ? 'bg-green-400' : 'bg-gray-500'}`} />
          <span className="text-sm text-gray-300">{ollamaStatus.running ? 'Running' : 'Stopped'}</span>
          {versionInfo && <span className="text-xs text-gray-500 font-mono">v{versionInfo.installed}</span>}
        </div>
        <div className="flex items-center gap-2">
          {versionInfo?.updateAvailable && (
            <span className="text-xs text-amber-400">v{versionInfo.latest} available</span>
          )}
          {versionInfo?.updateAvailable ? (
            <button
              onClick={handleUpdateOllama}
              disabled={isBusy}
              className="px-3 py-1 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {activeOp?.type === 'ollama-update' ? `Updating... ${activeOp.percent}%` : 'Update Ollama'}
            </button>
          ) : (
            <button
              onClick={checkForUpdate}
              disabled={checkingUpdate || isBusy}
              className="px-3 py-1 text-xs rounded-lg border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkingUpdate ? 'Checking...' : 'Check for Updates'}
            </button>
          )}
        </div>
      </div>

      {/* Ollama update progress bar */}
      {activeOp?.type === 'ollama-update' && (
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div
            className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${activeOp.percent}%` }}
          />
        </div>
      )}

      {/* VRAM Info */}
      {vram > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/40 rounded-lg">
          <span className="text-xs text-gray-400">GPU VRAM:</span>
          <div className="flex-1 bg-gray-700 rounded-full h-1.5">
            <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '100%' }} />
          </div>
          <span className="text-xs text-gray-300 font-mono">{(vram / 1000).toFixed(1)} GB</span>
        </div>
      )}
      {vram === 0 && ollamaStatus.running && (
        <div className="text-xs text-gray-500 px-3 py-2 bg-gray-800/40 rounded-lg">
          GPU VRAM not detected (no NVIDIA GPU found). Model performance estimates unavailable.
        </div>
      )}

      {!ollamaStatus.running && (
        <div className="text-xs text-gray-500">Ollama is installed but not running. Start it to manage models.</div>
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
                    Recommended for Your GPU
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
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-800/60 rounded-lg border border-gray-700 hover:border-green-600 hover:text-green-400 text-gray-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <span>{m.name}</span>
                          <span className={`text-[10px] px-1 py-0.5 rounded ${style.className}`}>{style.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    These models should run well with your {(vram / 1000).toFixed(1)}GB VRAM.
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
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pull Custom Model</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomPull()}
                placeholder="e.g. llama3.2:1b"
                disabled={isBusy}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
              />
              <button
                onClick={handleCustomPull}
                disabled={isBusy || !customModelName.trim()}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-700 text-gray-400 hover:border-amber-600 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Pull
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">
              Browse models at{' '}
              <button
                onClick={() => window.open('https://ollama.com/library', '_blank')}
                className="text-gray-500 hover:text-amber-400 cursor-pointer"
              >
                ollama.com/library
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
