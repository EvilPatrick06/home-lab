import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'

type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

interface UpdateStatusInfo {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
  releaseNotes?: string
}

export function UpdateSection(): JSX.Element {
  const { t } = useT()
  const [status, setStatus] = useState<UpdateStatusInfo>({ state: 'idle' })
  const [appVersion, setAppVersion] = useState<string>('')
  const listenerRegistered = useRef(false)

  // v2.1.16: persisted auto-update preferences. Auto-check defaults ON (matches
  // the main-process default in updater.ts) so it surfaces fixes out of the box.
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true)
  const [autoDownloadUpdates, setAutoDownloadUpdates] = useState(false)
  const [autoRestartAfterUpdate, setAutoRestartAfterUpdate] = useState(false)
  const [autoInstallSilent, setAutoInstallSilent] = useState(false)

  useEffect(() => {
    window.api
      .getVersion()
      .then(setAppVersion)
      .catch(() => {})
    if (!listenerRegistered.current) {
      listenerRegistered.current = true
      window.api.update.onStatus((s) => {
        setStatus(s as UpdateStatusInfo)
      })
    }
    // Hydrate the auto-update prefs from persisted settings.
    window.api.loadSettings().then((s) => {
      setAutoCheckUpdates(s.autoCheckUpdates !== false)
      setAutoDownloadUpdates(s.autoDownloadUpdates === true)
      setAutoRestartAfterUpdate(s.autoRestartAfterUpdate === true)
      setAutoInstallSilent(s.autoInstallSilent === true)
    })
    return () => {
      window.api.update.removeStatusListener()
      listenerRegistered.current = false
    }
  }, [])

  // Persist auto-update pref changes immediately so the main process
  // picks them up on next launch (and on the next install handler).
  const persistAutoPrefs = async (patch: {
    autoCheckUpdates?: boolean
    autoDownloadUpdates?: boolean
    autoRestartAfterUpdate?: boolean
    autoInstallSilent?: boolean
  }): Promise<void> => {
    try {
      const settings = await window.api.loadSettings()
      await window.api.saveSettings({ ...settings, ...patch })
    } catch {
      // ignore — UI keeps the local state; user can retry by toggling again
    }
  }

  const handleCheck = async (): Promise<void> => {
    setStatus({ state: 'checking' })
    try {
      const result = await window.api.update.checkForUpdates()
      setStatus(result as UpdateStatusInfo)
    } catch {
      setStatus({ state: 'error', message: t('pages.settingsPage.checkUpdatesFailed') })
    }
  }

  const handleDownload = async (): Promise<void> => {
    setStatus({ state: 'downloading', percent: 0, version: status.version })
    try {
      const result = await window.api.update.downloadUpdate()
      setStatus(result as UpdateStatusInfo)
    } catch {
      setStatus({ state: 'error', message: t('pages.settingsPage.downloadFailed') })
    }
  }

  const handleInstall = async (): Promise<void> => {
    try {
      await window.api.update.installUpdate()
    } catch {
      setStatus({ state: 'error', message: t('pages.settingsPage.installFailed') })
    }
  }

  const statusLabel = (): string => {
    switch (status.state) {
      case 'idle':
        return ''
      case 'checking':
        return t('pages.settingsPage.checkingForUpdates')
      case 'available':
        return t('pages.settingsPage.versionAvailable', { version: status.version ?? 'unknown' })
      case 'not-available':
        return t('pages.settingsPage.onLatestVersion')
      case 'downloading':
        return t('pages.settingsPage.downloadingUpdate', { percent: status.percent ?? 0 })
      case 'downloaded':
        return t('pages.settingsPage.versionDownloaded', { version: status.version ?? 'unknown' })
      case 'error':
        return status.message ?? t('pages.settingsPage.errorOccurred')
    }
  }

  return (
    <div className="space-y-3">
      {appVersion && (
        <p className="text-xs text-gray-500">{t('pages.settingsPage.currentVersion', { version: appVersion })}</p>
      )}

      {/* Status display */}
      {status.state !== 'idle' && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            status.state === 'error'
              ? 'bg-red-900/30 text-red-300 border border-red-700/50'
              : status.state === 'downloaded'
                ? 'bg-green-900/30 text-green-300 border border-green-700/50'
                : status.state === 'available'
                  ? 'bg-amber-900/30 text-amber-300 border border-amber-700/50'
                  : 'bg-surface-2/50 text-gray-300 border border-border/50'
          }`}
        >
          {statusLabel()}
        </div>
      )}

      {/* Download progress bar */}
      {status.state === 'downloading' && (
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-strong rounded-full transition-all duration-300"
            style={{ width: `${status.percent ?? 0}%` }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {(status.state === 'idle' || status.state === 'not-available' || status.state === 'error') && (
          <button
            onClick={handleCheck}
            className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer"
          >
            {t('pages.settingsPage.checkForUpdates')}
          </button>
        )}
        {status.state === 'available' && (
          <button
            onClick={handleDownload}
            className="px-4 py-1.5 text-sm rounded-lg bg-amber-600 hover:bg-accent-strong text-white transition-colors cursor-pointer"
          >
            {t('pages.settingsPage.downloadUpdate')}
          </button>
        )}
        {status.state === 'downloaded' && (
          <button
            onClick={handleInstall}
            className="px-4 py-1.5 text-sm rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors cursor-pointer"
          >
            {t('pages.settingsPage.installAndRestart')}
          </button>
        )}
        {status.state === 'checking' && (
          <span className="text-sm text-muted animate-pulse">{t('pages.settingsPage.checking')}</span>
        )}
      </div>

      {(status.state === 'available' || status.state === 'downloaded') && status.releaseNotes && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{t('pages.settingsPage.whatsNew')}</p>
          <div className="text-sm text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {status.releaseNotes}
          </div>
        </div>
      )}

      {/* v2.1.16 auto-update preferences. All four default off; opt-in. */}
      <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
        <p className="text-xs uppercase tracking-wider text-gray-500">{t('pages.settingsPage.autoUpdatePrefs')}</p>
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            name="auto-check-updates"
            type="checkbox"
            checked={autoCheckUpdates}
            onChange={(e) => {
              setAutoCheckUpdates(e.target.checked)
              void persistAutoPrefs({ autoCheckUpdates: e.target.checked })
            }}
            className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer"
          />
          <span>
            {t('pages.settingsPage.autoCheckLabel')}
            <span className="block text-xs text-gray-500">{t('pages.settingsPage.autoCheckDesc')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            name="auto-download-updates"
            type="checkbox"
            checked={autoDownloadUpdates}
            disabled={!autoCheckUpdates}
            onChange={(e) => {
              setAutoDownloadUpdates(e.target.checked)
              void persistAutoPrefs({ autoDownloadUpdates: e.target.checked })
            }}
            className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <span>
            {t('pages.settingsPage.autoDownloadLabel')}
            <span className="block text-xs text-gray-500">{t('pages.settingsPage.autoDownloadDesc')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            name="auto-restart-after-update"
            type="checkbox"
            checked={autoRestartAfterUpdate}
            disabled={!autoCheckUpdates || !autoDownloadUpdates}
            onChange={(e) => {
              setAutoRestartAfterUpdate(e.target.checked)
              void persistAutoPrefs({ autoRestartAfterUpdate: e.target.checked })
            }}
            className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <span>
            {t('pages.settingsPage.autoRestartLabel')}
            <span className="block text-xs text-gray-500">{t('pages.settingsPage.autoRestartDesc')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-300 cursor-pointer">
          <input
            name="auto-install-silent"
            type="checkbox"
            checked={autoInstallSilent}
            onChange={(e) => {
              setAutoInstallSilent(e.target.checked)
              void persistAutoPrefs({ autoInstallSilent: e.target.checked })
            }}
            className="mt-0.5 w-3.5 h-3.5 accent-amber-500 cursor-pointer"
          />
          <span>
            {t('pages.settingsPage.silentInstallLabel')}
            <span className="block text-xs text-gray-500">{t('pages.settingsPage.silentInstallDesc')}</span>
          </span>
        </label>
      </div>
    </div>
  )
}
