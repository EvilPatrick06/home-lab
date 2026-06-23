import { useEffect, useState } from 'react'
import { useT } from '../../i18n'

interface CloudSyncState {
  configured: boolean
  remotes: string[]
  version?: string
  error?: string
  lastBackupTime?: string
  campaigns: Array<{ id: string; name: string }>
}

export function CloudBackupSection(): JSX.Element {
  const { t } = useT()
  const [syncState, setSyncState] = useState<CloudSyncState>({
    configured: false,
    remotes: [],
    campaigns: []
  })
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  // Auto-backup on launch when stale (default on; no-op unless cloud configured).
  const [autoBackup, setAutoBackup] = useState(true)
  // The Pi base URL is preset for everyone (the public tunnel default + LAN
  // mDNS auto-discovery) and BMO is reachable without an API key, so there's
  // nothing to configure here — just the backup actions below.

  // Phase 36 / R-lib — the 5e library loads from the Pi by default and falls
  // back to bundled data automatically when the Pi is unreachable (see
  // services/library/remote-library.ts). There is intentionally NO setting for
  // this — it's automatic, so no toggle is rendered here.
  useEffect(() => {
    window.api
      .loadSettings()
      .then((s) => {
        // Seed the backup display from the persisted timestamp so it survives relaunch.
        if (s?.lastBackupTime) setSyncState((prev) => ({ ...prev, lastBackupTime: s.lastBackupTime }))
        setAutoBackup(s?.autoBackupOnLaunch !== false)
      })
      .catch(() => {})
  }, [])

  const handleToggleAutoBackup = async (checked: boolean): Promise<void> => {
    setAutoBackup(checked)
    try {
      const s = await window.api.loadSettings()
      await window.api.saveSettings({ ...s, autoBackupOnLaunch: checked })
    } catch {
      setAutoBackup(!checked) // revert on failure
    }
  }

  const handleCheckStatus = async (): Promise<void> => {
    setLoading('status')
    setMessage(null)
    try {
      const result = await window.api.cloudSync.getStatus()
      setSyncState((prev) => ({
        ...prev,
        configured: result.configured,
        remotes: result.remotes,
        version: result.version,
        error: result.error
      }))
      if (!result.configured && result.error) {
        setMessage({ text: t('pages.settingsPage.cloudPiUnreachable'), type: 'error' })
      } else if (result.configured) {
        setMessage({ text: t('pages.settingsPage.cloudConnected'), type: 'success' })
      }
    } catch {
      setMessage({ text: t('pages.settingsPage.cloudConnectFailed'), type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  const handleBackupNow = async (): Promise<void> => {
    setLoading('backup')
    setMessage(null)
    try {
      const campaigns = (await window.api.loadCampaigns()) as { id: string; name: string }[] | null
      if (!campaigns || campaigns.length === 0) {
        setMessage({ text: t('pages.settingsPage.noCampaignsToBackup'), type: 'error' })
        return
      }
      // CLD-2 — back up EVERY campaign, not just campaigns[0]. "Backup Now" implies
      // all data; backing up only the first silently left the rest unprotected.
      let succeeded = 0
      const failures: string[] = []
      for (const campaign of campaigns) {
        try {
          const result = await window.api.cloudSync.backupCampaign(campaign.id, campaign.name)
          if (result.success) succeeded++
          else failures.push(campaign.name)
        } catch {
          failures.push(campaign.name)
        }
      }
      if (succeeded > 0) {
        const now = new Date().toISOString()
        setSyncState((prev) => ({ ...prev, lastBackupTime: now }))
        // Persist so both the display and the on-launch staleness nudge survive a relaunch.
        try {
          const s = await window.api.loadSettings()
          await window.api.saveSettings({ ...s, lastBackupTime: now })
        } catch {
          /* best-effort persist */
        }
      }
      if (failures.length === 0) {
        setMessage({ text: t('pages.settingsPage.backupCompletedAll', { count: succeeded }), type: 'success' })
      } else if (succeeded > 0) {
        setMessage({
          text: t('pages.settingsPage.backupPartial', { succeeded, failed: failures.length }),
          type: 'error'
        })
      } else {
        setMessage({ text: t('pages.settingsPage.backupFailed'), type: 'error' })
      }
    } catch {
      setMessage({ text: t('pages.settingsPage.backupFailedReachable'), type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  const handleListBackups = async (): Promise<void> => {
    setLoading('list')
    setMessage(null)
    try {
      const result = await window.api.cloudSync.listRemoteCampaigns()
      if (result.success && result.campaigns) {
        // The remote list keys on campaign id (no name stored on the Pi). Show
        // the friendly local name where we have that campaign locally; fall back
        // to the id for backups of campaigns not on this machine.
        const local = ((await window.api.loadCampaigns()) ?? []) as Array<{ id: string; name: string }>
        const nameById = new Map(local.map((c) => [c.id, c.name]))
        const named = (result.campaigns ?? []).map((c) => ({ ...c, name: nameById.get(c.id) ?? c.id }))
        setSyncState((prev) => ({
          ...prev,
          campaigns: named
        }))
        setMessage({
          text:
            result.campaigns.length > 0
              ? result.campaigns.length !== 1
                ? t('pages.settingsPage.foundBackupsPlural', { count: result.campaigns.length })
                : t('pages.settingsPage.foundBackupsSingular', { count: result.campaigns.length })
              : t('pages.settingsPage.noBackupsFound'),
          type: 'success'
        })
      } else {
        setMessage({ text: result.error ?? t('pages.settingsPage.listBackupsFailed'), type: 'error' })
      }
    } catch {
      setMessage({ text: t('pages.settingsPage.listBackupsFailedReachable'), type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  const handleRestore = async (id: string, name: string): Promise<void> => {
    // Restore overwrites the local copy — confirm first (window.confirm is the
    // page's established pattern for destructive actions).
    if (!window.confirm(t('pages.settingsPage.restoreConfirm', { name }))) return
    setLoading(`restore:${id}`)
    setMessage(null)
    try {
      const result = await window.api.cloudSync.restoreCampaign(id)
      if (result.success) {
        setMessage({ text: result.message ?? t('pages.settingsPage.restored'), type: 'success' })
      } else {
        setMessage({ text: result.error ?? t('pages.settingsPage.restoreFailed'), type: 'error' })
      }
    } catch {
      setMessage({ text: t('pages.settingsPage.restoreFailed'), type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('pages.settingsPage.cloudBackupDesc')}</p>

      {/* Status display */}
      {message && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            message.type === 'error'
              ? 'bg-red-900/30 text-red-300 border border-red-700/50'
              : 'bg-green-900/30 text-green-300 border border-green-700/50'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Remote info */}
      {syncState.configured && (
        <div className="text-xs text-muted space-y-1">
          {syncState.remotes.length > 0 && (
            <p>{t('pages.settingsPage.configuredRemotes', { remotes: syncState.remotes.join(', ') })}</p>
          )}
          {syncState.version && <p>{t('pages.settingsPage.rcloneVersion', { version: syncState.version })}</p>}
          {syncState.lastBackupTime && (
            <p>{t('pages.settingsPage.lastBackup', { time: new Date(syncState.lastBackupTime).toLocaleString() })}</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCheckStatus}
          disabled={loading === 'status'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'status' ? t('pages.settingsPage.checking') : t('pages.settingsPage.checkStatus')}
        </button>
        <button
          onClick={handleBackupNow}
          disabled={loading === 'backup'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'backup' ? t('pages.settingsPage.backingUp') : t('pages.settingsPage.backupNow')}
        </button>
        <button
          onClick={handleListBackups}
          disabled={loading === 'list'}
          className="px-4 py-1.5 text-sm rounded-lg border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading === 'list' ? t('common.states.loading') : t('pages.settingsPage.listBackups')}
        </button>
      </div>

      {/* Auto-backup-on-launch toggle (opt out of the automatic stale backup) */}
      <label className="flex items-start gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={autoBackup}
          onChange={(e) => void handleToggleAutoBackup(e.target.checked)}
          className="mt-0.5 cursor-pointer"
        />
        <span>
          {t('pages.settingsPage.autoBackupToggle')}
          <span className="block text-xs text-gray-500">{t('pages.settingsPage.autoBackupDesc')}</span>
        </span>
      </label>

      {/* Backed-up campaigns list */}
      {syncState.campaigns.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted font-semibold">{t('pages.settingsPage.backedUpCampaigns')}</p>
          {syncState.campaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between py-1.5 px-2 rounded bg-surface-2/30 border border-border/30"
            >
              <span className="text-sm text-gray-300">{c.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{c.id.slice(0, 8)}...</span>
                <button
                  onClick={() => void handleRestore(c.id, c.name)}
                  disabled={loading === `restore:${c.id}`}
                  className="px-2.5 py-1 text-xs rounded border bg-surface-2 border-border text-gray-300 hover:border-amber-600 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading === `restore:${c.id}` ? t('pages.settingsPage.restoring') : t('pages.settingsPage.restore')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
