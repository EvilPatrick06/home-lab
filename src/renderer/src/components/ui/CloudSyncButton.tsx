/**
 * CloudSyncButton — Standalone button for backing up campaigns to Google Drive
 *
 * A compact button component that can be placed in campaign headers,
 * detail pages, or toolbars to provide quick backup functionality.
 */

import { useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import { backupCampaignToCloud, checkCloudSyncStatus } from '../../services/cloud-sync-service'

interface CloudSyncButtonProps {
  campaignId: string
  campaignName: string
  variant?: 'compact' | 'full'
  className?: string
}

export default function CloudSyncButton({
  campaignId,
  campaignName,
  variant = 'compact',
  className = ''
}: CloudSyncButtonProps): JSX.Element {
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)

  // Check availability on first interaction
  const checkAvailability = async (): Promise<boolean> => {
    if (isAvailable !== null) return isAvailable
    const status = await checkCloudSyncStatus()
    const available = status.success && status.configured
    setIsAvailable(available)
    return available
  }

  const handleBackup = async () => {
    if (!campaignId || !campaignName) {
      addToast('Campaign information missing', 'error')
      return
    }

    // Check if cloud sync is available
    const available = await checkAvailability()
    if (!available) {
      addToast('Google Drive backup not configured on Pi', 'error', 5000)
      return
    }

    setIsBackingUp(true)
    try {
      const result = await backupCampaignToCloud(campaignId, campaignName)
      if (!result.success) {
        // Error toast is already shown by the service
        setIsAvailable(false)
      }
    } finally {
      setIsBackingUp(false)
    }
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={() => void handleBackup()}
        disabled={isBackingUp}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer
          disabled:opacity-50 disabled:cursor-not-allowed
          bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white
          ${className}`}
        title="Backup campaign to Google Drive"
      >
        {isBackingUp ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-gray-500 border-t-amber-500 rounded-full animate-spin" />
            <span>Backing up...</span>
          </>
        ) : (
          <>
            <span className="text-amber-400">{'☁'}</span>
            <span>Backup to Drive</span>
          </>
        )}
      </button>
    )
  }

  // Full variant with icon and text
  return (
    <button
      onClick={() => void handleBackup()}
      disabled={isBackingUp}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20
        ${className}`}
    >
      {isBackingUp ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span>Backing up to Google Drive...</span>
        </>
      ) : (
        <>
          <span className="text-lg">{'☁↑'}</span>
          <span>Backup to Google Drive</span>
        </>
      )}
    </button>
  )
}
