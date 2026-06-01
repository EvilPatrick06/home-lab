import { useEffect, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'

/**
 * Phase 14c — one-time "Install Ollama for local AI?" prompt.
 *
 * On first launch where the flag is unset AND Ollama is not detected, show a single modal with
 * Install / Not now. Either choice sets the flag so it never reappears. One code path for both
 * platforms — the platform difference lives entirely in the main-process `ollama-manager` (14b):
 * Windows downloads the signed installer (percentage), Linux/macOS run the official install
 * script (indeterminate spinner). A profile that already has Ollama never sees this.
 */
const FLAG_KEY = 'dnd-vtt-ollama-first-run-prompted'

export default function OllamaFirstRunPrompt(): JSX.Element | null {
  const { t } = useT()
  const [show, setShow] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (localStorage.getItem(FLAG_KEY) === 'true') return
    void window.api.ai
      .detectOllama()
      .then((status) => {
        if (!cancelled && !status?.installed) setShow(true)
      })
      .catch(() => {
        // Detection failed (no IPC / error) — don't nag; leave the prompt for a later launch.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dismiss = (): void => {
    localStorage.setItem(FLAG_KEY, 'true')
    setShow(false)
  }

  const handleInstall = async (): Promise<void> => {
    setInstalling(true)
    try {
      const dl = await window.api.ai.downloadOllama()
      if (!dl.success || !dl.path) {
        addToast(dl.error ?? t('ui.ollamaFirstRun.downloadFailed'), 'error')
        return
      }
      const inst = await window.api.ai.installOllama(dl.path)
      if (!inst.success) {
        addToast(inst.error ?? t('ui.ollamaFirstRun.installFailed'), 'error')
        return
      }
      addToast(t('ui.ollamaFirstRun.installedReady'), 'success')
      dismiss()
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('ui.ollamaFirstRun.installError'), 'error')
    } finally {
      setInstalling(false)
    }
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
      <div className="bg-surface border border-border rounded-lg shadow-xl w-[420px] p-5 space-y-4">
        <h2 className="text-lg font-semibold text-fg">{t('ui.ollamaFirstRun.title')}</h2>
        <p className="text-sm text-gray-300 leading-relaxed">
          {t('ui.ollamaFirstRun.descriptionLead')}{' '}
          <span className="text-accent">{t('ui.ollamaFirstRun.settingsPath')}</span>.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={dismiss}
            disabled={installing}
            className="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer disabled:opacity-50"
          >
            {t('ui.ollamaFirstRun.notNow')}
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="px-3 py-1.5 text-sm font-medium rounded bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white cursor-pointer"
          >
            {installing ? t('ui.ollamaFirstRun.installing') : t('ui.ollamaFirstRun.install')}
          </button>
        </div>
      </div>
    </div>
  )
}
