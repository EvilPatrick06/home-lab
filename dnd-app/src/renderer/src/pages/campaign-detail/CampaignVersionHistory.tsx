import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import { useEscapeKey } from '../../hooks/use-escape-key'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { useCampaignStore } from '../../stores/use-campaign-store'

interface CampaignVersion {
  fileName: string
  timestamp: string
  sizeBytes: number
}

/**
 * Campaign version-history restore panel. Surfaces the on-disk `.versions/`
 * backups (written by `campaign-storage.saveCampaign`) that were previously
 * write-only — listing them and letting the user roll back. Mirrors the
 * character version-history UI in `CharacterSheet5ePage`. Restoring re-saves the
 * chosen version as the current campaign (which itself creates a fresh backup,
 * so a restore is reversible) and reloads the campaign store.
 */
export default function CampaignVersionHistory({ campaignId }: { campaignId: string }): JSX.Element {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<CampaignVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [confirmFile, setConfirmFile] = useState<string | null>(null)
  useEscapeKey(() => setOpen(false), open)

  const k = (s: string): string => t(`pages.campaignDetailPage.versionHistory.${s}`)

  async function openHistory(): Promise<void> {
    setOpen(true)
    setLoading(true)
    try {
      const result = await window.api.listCampaignVersions(campaignId)
      if (result.success && result.data) setVersions(result.data)
    } catch {
      addToast(k('toastLoadFailed'), 'error')
    }
    setLoading(false)
  }

  async function doRestore(fileName: string): Promise<void> {
    setConfirmFile(null)
    setRestoring(fileName)
    try {
      const result = await window.api.restoreCampaignVersion(campaignId, fileName)
      if (result.success && result.data) {
        await useCampaignStore.getState().loadCampaigns()
        setOpen(false)
        addToast(k('toastRestored'), 'success')
      } else {
        addToast(k('toastRestoreFailed'), 'error')
      }
    } catch {
      addToast(k('toastRestoreFailed'), 'error')
    }
    setRestoring(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={openHistory}
        className="px-3 py-1.5 text-sm border border-gray-600 hover:border-gray-500 text-muted hover:text-gray-200 rounded transition-colors"
      >
        {k('button')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} role="presentation" />
          <div className="relative bg-surface border border-border rounded-xl p-5 w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-accent">{k('title')}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={k('close')}
                className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {loading ? (
                <p className="text-xs text-gray-500 text-center py-4">{k('loading')}</p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">{k('none')}</p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.fileName}
                    className="flex items-center justify-between bg-surface-2/50 rounded-lg px-3 py-2 border border-border/30"
                  >
                    <div>
                      <div className="text-xs text-gray-200">
                        {new Date(v.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('pages.campaignDetailPage.versionHistory.size', {
                          size: (v.sizeBytes / 1024).toFixed(1)
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmFile(v.fileName)}
                      disabled={restoring !== null}
                      className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer transition-colors"
                    >
                      {restoring === v.fileName ? k('restoring') : k('restore')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <Modal open={confirmFile !== null} onClose={() => setConfirmFile(null)} title={k('confirmTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-300">{k('confirmPrompt')}</p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setConfirmFile(null)}
              className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              type="button"
              onClick={() => confirmFile && doRestore(confirmFile)}
              className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold transition-colors"
            >
              {k('restore')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
