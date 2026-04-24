export interface InstalledModel {
  name: string
  size: number
  modifiedAt: string
  digest: string
  parameterSize?: string
  quantization?: string
  family?: string
}

export interface CuratedModel {
  id: string
  name: string
  vramMB: number
  contextSize: number
  desc: string
}

export type PerformanceTier = 'optimal' | 'good' | 'limited' | 'insufficient'

export function getPerformanceTier(systemVramMb: number, modelVramMb: number): PerformanceTier {
  const ratio = systemVramMb / modelVramMb
  if (ratio >= 2) return 'optimal'
  if (ratio >= 1.2) return 'good'
  if (ratio >= 0.8) return 'limited'
  return 'insufficient'
}

export const TIER_STYLES: Record<PerformanceTier, { label: string; className: string }> = {
  optimal: { label: 'Optimal', className: 'text-green-400 bg-green-900/30' },
  good: { label: 'Good', className: 'text-yellow-400 bg-yellow-900/30' },
  limited: { label: 'Limited', className: 'text-orange-400 bg-orange-900/30' },
  insufficient: { label: 'Insufficient', className: 'text-red-400 bg-red-900/30' }
}

export type ActiveOp =
  | { type: 'pull'; model: string; percent: number }
  | { type: 'ollama-update'; percent: number }
  | { type: 'delete'; model: string }
  | null

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

interface InstalledModelListProps {
  models: InstalledModel[]
  curatedModels: CuratedModel[]
  activeOp: ActiveOp
  isBusy: boolean
  vram: number
  onPull: (modelName: string) => void
  onDelete: (modelName: string) => void
  onUpdateAll: () => void
}

export function InstalledModelList({
  models,
  curatedModels,
  activeOp,
  isBusy,
  vram,
  onPull,
  onDelete,
  onUpdateAll
}: InstalledModelListProps): JSX.Element {
  // Build a lookup from curated model ID to its data
  const curatedLookup = new Map(curatedModels.map((c) => [c.id.replace(/:latest$/, ''), c]))

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Installed Models</h4>
        {models.length > 0 && (
          <button
            onClick={onUpdateAll}
            disabled={isBusy}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Update All
          </button>
        )}
      </div>

      {models.length === 0 ? (
        <p className="text-sm text-gray-500">No models installed yet.</p>
      ) : (
        <div className="space-y-1.5">
          {models.map((model) => {
            const isPulling = activeOp?.type === 'pull' && activeOp.model === model.name
            const isDeleting = activeOp?.type === 'delete' && activeOp.model === model.name
            const curated = curatedLookup.get(model.name.replace(/:latest$/, ''))
            const tier = vram > 0 && curated ? getPerformanceTier(vram, curated.vramMB) : null
            const tierStyle = tier ? TIER_STYLES[tier] : null
            return (
              <div key={model.digest} className="flex items-center justify-between py-2 px-3 bg-gray-800/40 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-200 font-medium truncate">{model.name}</span>
                    {model.parameterSize && (
                      <span className="text-[10px] text-gray-500 bg-gray-700/60 px-1.5 py-0.5 rounded">
                        {model.parameterSize}
                      </span>
                    )}
                    {model.quantization && (
                      <span className="text-[10px] text-gray-500 bg-gray-700/60 px-1.5 py-0.5 rounded">
                        {model.quantization}
                      </span>
                    )}
                    {model.family && (
                      <span className="text-[10px] text-gray-500 bg-gray-700/60 px-1.5 py-0.5 rounded">
                        {model.family}
                      </span>
                    )}
                    {tierStyle && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${tierStyle.className}`}>
                        {tierStyle.label}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {formatBytes(model.size)}
                    {curated && <> &middot; ~{(curated.vramMB / 1000).toFixed(1)}GB VRAM</>} &middot;{' '}
                    {timeAgo(model.modifiedAt)}
                  </div>
                </div>

                {isPulling ? (
                  <div className="flex items-center gap-2 ml-3">
                    <div className="w-16 bg-gray-700 rounded-full h-1">
                      <div
                        className="bg-amber-500 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${activeOp.percent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 w-8 text-right">{activeOp.percent}%</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => onPull(model.name)}
                      disabled={isBusy}
                      title="Update model"
                      className="p-1.5 text-gray-500 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm-7.268-4.43a.75.75 0 0 0 .196-.013 5.5 5.5 0 0 1 9.201-2.466l.312.311h-2.433a.75.75 0 0 0 0 1.5h3.634a.75.75 0 0 0 .75-.75V1.942a.75.75 0 0 0-1.5 0v2.033l-.312-.311A7 7 0 0 0 6.172 6.802a.75.75 0 0 0 1.449.39 5.506 5.506 0 0 1 .423-.198Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(model.name)}
                      disabled={isBusy}
                      title="Delete model"
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? (
                        <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-3.5 h-3.5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.798l-.35 5.5a.75.75 0 0 1-1.497-.096l.35-5.5a.75.75 0 0 1 .797-.702Zm2.84 0a.75.75 0 0 1 .798.702l.35 5.5a.75.75 0 0 1-1.497.096l-.35-5.5a.75.75 0 0 1 .7-.798Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface AvailableModelListProps {
  models: CuratedModel[]
  activeOp: ActiveOp
  isBusy: boolean
  vram: number
  onPull: (modelId: string) => void
}

export function AvailableModelList({ models, activeOp, isBusy, vram, onPull }: AvailableModelListProps): JSX.Element {
  if (models.length === 0) return <></>

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Available Models</h4>
      <div className="space-y-1.5">
        {models.map((model) => {
          const isPulling = activeOp?.type === 'pull' && activeOp.model === model.id
          const tier = vram > 0 ? getPerformanceTier(vram, model.vramMB) : null
          const tierStyle = tier ? TIER_STYLES[tier] : null
          return (
            <div key={model.id} className="flex items-center justify-between py-2 px-3 bg-gray-800/40 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-300 font-medium">{model.name}</span>
                  {tierStyle && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${tierStyle.className}`}>
                      {tierStyle.label}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {model.desc} &middot; ~{(model.vramMB / 1000).toFixed(1)}GB VRAM &middot;{' '}
                  {(model.contextSize / 1024).toFixed(0)}K ctx
                </div>
              </div>

              {isPulling ? (
                <div className="flex items-center gap-2 ml-3">
                  <div className="w-16 bg-gray-700 rounded-full h-1">
                    <div
                      className="bg-amber-500 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${activeOp.percent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 w-8 text-right">{activeOp.percent}%</span>
                </div>
              ) : (
                <button
                  onClick={() => onPull(model.id)}
                  disabled={isBusy}
                  className="ml-3 px-3 py-1 text-xs rounded-lg border border-gray-700 text-gray-400 hover:border-amber-600 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Install
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
