import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../../i18n'

interface MemoryFileInfo {
  name: string
  size: number
}

interface AiContextPanelProps {
  campaignId: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AiContextPanel({ campaignId }: AiContextPanelProps): JSX.Element {
  const { t } = useT()
  const [files, setFiles] = useState<MemoryFileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [viewingFile, setViewingFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [clearing, setClearing] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.ai.listMemoryFiles(campaignId)
      setFiles(result)
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleView = useCallback(
    async (fileName: string) => {
      if (viewingFile === fileName) {
        setViewingFile(null)
        setFileContent('')
        return
      }
      setLoadingContent(true)
      setViewingFile(fileName)
      try {
        const content = await window.api.ai.readMemoryFile(campaignId, fileName)
        setFileContent(content)
      } catch {
        setFileContent(t('game.aiContextPanel.errorReadingFile'))
      } finally {
        setLoadingContent(false)
      }
    },
    [campaignId, viewingFile, t]
  )

  const handleClear = useCallback(async () => {
    if (!confirm(t('game.aiContextPanel.clearConfirm'))) return
    setClearing(true)
    try {
      await window.api.ai.clearMemory(campaignId)
      setFiles([])
      setViewingFile(null)
      setFileContent('')
    } catch {
      // Non-fatal
    } finally {
      setClearing(false)
    }
  }, [campaignId, t])

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)

  return (
    <div className="w-full bg-gray-900/60 border border-gray-700/40 rounded-lg px-3 py-2 mt-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
          {t('game.aiContextPanel.heading')}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">
            {t('game.aiContextPanel.total', { size: formatSize(totalSize) })}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-1.5 py-0.5 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? t('common.states.loading') : t('game.aiContextPanel.refresh')}
          </button>
          <button
            onClick={handleClear}
            disabled={clearing || files.length === 0}
            className="px-1.5 py-0.5 text-xs rounded bg-red-900/40 text-red-400 hover:bg-red-800/40 hover:text-red-300 border border-red-700/30 transition-colors cursor-pointer disabled:opacity-50"
          >
            {clearing ? t('game.aiContextPanel.clearing') : t('game.aiContextPanel.clearMemory')}
          </button>
        </div>
      </div>

      {files.length === 0 && !loading ? (
        <div className="text-xs text-gray-600 py-1">{t('game.aiContextPanel.noFiles')}</div>
      ) : (
        <div className="space-y-0.5">
          {files.map((file) => (
            <div key={file.name}>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-xs text-gray-400 font-mono truncate mr-2">{file.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-gray-600">{formatSize(file.size)}</span>
                  <button
                    onClick={() => handleView(file.name)}
                    className={`px-1.5 py-0.5 text-xs rounded transition-colors cursor-pointer ${
                      viewingFile === file.name
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                    }`}
                  >
                    {viewingFile === file.name ? t('game.aiContextPanel.hide') : t('game.aiContextPanel.view')}
                  </button>
                </div>
              </div>

              {viewingFile === file.name && (
                <div className="mt-0.5 mb-1">
                  {loadingContent ? (
                    <div className="text-xs text-gray-600 py-1">{t('common.states.loading')}</div>
                  ) : (
                    <pre className="text-xs text-gray-400 bg-gray-950/60 border border-gray-800/60 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                      {fileContent || t('game.aiContextPanel.empty')}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
