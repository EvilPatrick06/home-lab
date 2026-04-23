/**
 * CloudSyncPanel — DM tool for backing up campaigns to Google Drive
 *
 * Provides UI for checking remote status, viewing backup status,
 * and triggering manual backups via Rclone on the BMO Pi.
 */

import { useCloudSync } from '../../../hooks/use-cloud-sync'
import { useGameStore } from '../../../stores/use-game-store'

interface CloudSyncPanelProps {
  campaignId?: string
  campaignName?: string
}

function formatLastSync(dateString?: string): string {
  if (!dateString) return 'Never'
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  } catch {
    return 'Unknown'
  }
}

export default function CloudSyncPanel({
  campaignId: propCampaignId,
  campaignName: propCampaignName
}: CloudSyncPanelProps): JSX.Element {
  // Get campaign info from props or game store
  const storeCampaignId = useGameStore((s) => s.campaignId)
  const campaignId = propCampaignId || storeCampaignId

  // Try to get campaign name from store if not provided
  const campaigns = useGameStore((s) => s.campaigns)
  const campaign = campaigns.find((c) => c.id === campaignId)
  const campaignName = propCampaignName || campaign?.name || 'Unnamed Campaign'

  const {
    isAvailable,
    isChecking,
    remoteStatus,
    campaignStatus,
    lastError,
    checkStatus,
    backup,
    isBackingUp,
    lastBackupTime
  } = useCloudSync({
    campaignId,
    campaignName,
    autoCheck: true
  })

  const handleBackup = async () => {
    await backup()
  }

  // Loading state while checking initial status
  if (isChecking && !remoteStatus) {
    return (
      <div className="p-3">
        <div className="flex items-center gap-2 text-gray-400">
          <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-sm">Checking cloud sync status...</span>
        </div>
      </div>
    )
  }

  // Not configured state
  if (!isAvailable) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-xl text-gray-500">{'☁'}</span>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-gray-300">Google Drive Backup</h4>
            <p className="text-xs text-gray-500 mt-1">Rclone not configured on BMO Pi</p>
          </div>
        </div>

        {lastError && (
          <div className="p-2 bg-red-950/30 border border-red-800/50 rounded text-xs text-red-300">{lastError}</div>
        )}

        <button
          onClick={() => void checkStatus()}
          disabled={isChecking}
          className="w-full py-2 px-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-gray-200 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isChecking ? 'Checking...' : 'Retry Connection'}
        </button>
      </div>
    )
  }

  // Main UI - Rclone configured
  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg text-green-500">{'☁'}</span>
          <div>
            <h4 className="text-sm font-medium text-gray-200">Google Drive Backup</h4>
            {remoteStatus?.version && <p className="text-[10px] text-gray-500">Rclone {remoteStatus.version}</p>}
          </div>
        </div>
        <button
          onClick={() => void checkStatus()}
          disabled={isChecking}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer disabled:opacity-50"
          title="Refresh status"
        >
          <span className={`inline-block ${isChecking ? 'animate-spin' : ''}`}>{'↻'}</span>
        </button>
      </div>

      {/* Campaign status */}
      {campaignStatus && (
        <div className="p-2.5 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Remote Backup</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                campaignStatus.hasRemoteData
                  ? 'bg-green-900/40 text-green-400 border border-green-700/50'
                  : 'bg-gray-700/50 text-gray-500 border border-gray-600/50'
              }`}
            >
              {campaignStatus.hasRemoteData ? 'Exists' : 'Not backed up'}
            </span>
          </div>
          {campaignStatus.hasRemoteData && campaignStatus.lastSync && (
            <p className="text-xs text-gray-500">Last modified: {formatLastSync(campaignStatus.lastSync)}</p>
          )}
        </div>
      )}

      {/* Backup button */}
      <button
        onClick={() => void handleBackup()}
        disabled={isBackingUp || !campaignId}
        className={`w-full py-2.5 px-3 rounded-lg font-medium text-sm transition-all cursor-pointer
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center gap-2
          ${
            isBackingUp
              ? 'bg-amber-700/50 text-amber-300'
              : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20'
          }`}
      >
        {isBackingUp ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Backing up...
          </>
        ) : (
          <>
            <span>{'↑'}</span>
            Backup to Drive
          </>
        )}
      </button>

      {/* Last local backup time */}
      {lastBackupTime && (
        <p className="text-[10px] text-gray-500 text-center">
          Last backup: {formatLastSync(lastBackupTime.toISOString())}
        </p>
      )}

      {/* Error message */}
      {lastError && (
        <div className="p-2 bg-red-950/30 border border-red-800/50 rounded text-xs text-red-300">{lastError}</div>
      )}

      {/* Info text */}
      <p className="text-[10px] text-gray-600 leading-relaxed">
        Backs up world-state.json, campaign data, and assets to Google Drive via Rclone on the Pi. Credentials remain
        securely on the Pi.
      </p>
    </div>
  )
}
