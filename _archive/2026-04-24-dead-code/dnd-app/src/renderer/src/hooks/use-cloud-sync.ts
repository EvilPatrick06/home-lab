/**
 * useCloudSync Hook
 *
 * React hook for managing cloud sync state and operations.
 * Provides status tracking, backup functionality, and UI state management.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  backupCampaignToCloud,
  type CampaignSyncStatus,
  type CloudBackupResult,
  type CloudSyncStatus,
  checkCampaignCloudStatus,
  checkCloudSyncStatus,
  isCloudSyncAvailable
} from '../services/cloud-sync-service'

interface UseCloudSyncOptions {
  campaignId?: string
  campaignName?: string
  autoCheck?: boolean
  checkInterval?: number
}

interface UseCloudSyncReturn {
  // Status
  isAvailable: boolean
  isChecking: boolean
  remoteStatus: CloudSyncStatus | null
  campaignStatus: CampaignSyncStatus | null
  lastError: string | null

  // Actions
  checkStatus: () => Promise<void>
  checkCampaign: () => Promise<void>
  backup: () => Promise<CloudBackupResult>

  // UI State
  isBackingUp: boolean
  lastBackupTime: Date | null
}

const DEFAULT_CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function useCloudSync(options: UseCloudSyncOptions = {}): UseCloudSyncReturn {
  const { campaignId, campaignName, autoCheck = true, checkInterval = DEFAULT_CHECK_INTERVAL } = options

  const [isAvailable, setIsAvailable] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [remoteStatus, setRemoteStatus] = useState<CloudSyncStatus | null>(null)
  const [campaignStatus, setCampaignStatus] = useState<CampaignSyncStatus | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [lastBackupTime, setLastBackupTime] = useState<Date | null>(null)

  const mountedRef = useRef(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check overall remote status
  const checkStatus = useCallback(async () => {
    if (!mountedRef.current) return

    setIsChecking(true)
    setLastError(null)

    try {
      const status = await checkCloudSyncStatus()
      if (!mountedRef.current) return

      setRemoteStatus(status)
      setIsAvailable(status.success && status.configured)

      if (!status.success) {
        setLastError(status.error || 'Failed to check cloud status')
      }
    } catch (err) {
      if (!mountedRef.current) return
      const errorMsg = err instanceof Error ? err.message : String(err)
      setLastError(errorMsg)
      setIsAvailable(false)
    } finally {
      if (mountedRef.current) {
        setIsChecking(false)
      }
    }
  }, [])

  // Check specific campaign status
  const checkCampaign = useCallback(async () => {
    if (!campaignId || !mountedRef.current) return

    try {
      const status = await checkCampaignCloudStatus(campaignId)
      if (!mountedRef.current) return

      setCampaignStatus(status)
    } catch (err) {
      if (!mountedRef.current) return
      const errorMsg = err instanceof Error ? err.message : String(err)
      setCampaignStatus({
        success: false,
        campaignId,
        error: errorMsg
      })
    }
  }, [campaignId])

  // Perform backup
  const backup = useCallback(async (): Promise<CloudBackupResult> => {
    if (!campaignId || !campaignName) {
      const error = 'Campaign ID and name required for backup'
      setLastError(error)
      return {
        success: false,
        error,
        campaignId: campaignId || '',
        campaignName: campaignName || ''
      }
    }

    setIsBackingUp(true)
    setLastError(null)

    try {
      const result = await backupCampaignToCloud(campaignId, campaignName)

      if (mountedRef.current) {
        if (result.success) {
          setLastBackupTime(new Date())
          setLastError(null)
          // Refresh campaign status after backup
          await checkCampaign()
        } else {
          setLastError(result.error || 'Backup failed')
        }
      }

      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      if (mountedRef.current) {
        setLastError(errorMsg)
      }
      return {
        success: false,
        error: errorMsg,
        campaignId,
        campaignName
      }
    } finally {
      if (mountedRef.current) {
        setIsBackingUp(false)
      }
    }
  }, [campaignId, campaignName, checkCampaign])

  // Initial status check
  useEffect(() => {
    if (autoCheck) {
      void checkStatus()
    }

    return () => {
      mountedRef.current = false
    }
  }, [autoCheck, checkStatus])

  // Periodic status checks
  useEffect(() => {
    if (!autoCheck || !checkInterval) return

    intervalRef.current = setInterval(() => {
      void checkStatus()
    }, checkInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoCheck, checkInterval, checkStatus])

  // Check campaign status when ID changes
  useEffect(() => {
    if (campaignId && isAvailable) {
      void checkCampaign()
    }
  }, [campaignId, isAvailable, checkCampaign])

  return {
    isAvailable,
    isChecking,
    remoteStatus,
    campaignStatus,
    lastError,
    checkStatus,
    checkCampaign,
    backup,
    isBackingUp,
    lastBackupTime
  }
}

/**
 * Simple hook for just checking if cloud sync is available
 * Use this for UI indicators that don't need full sync management
 */
export function useCloudSyncAvailability(): {
  isAvailable: boolean
  isChecking: boolean
  check: () => Promise<boolean>
} {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  const check = useCallback(async (): Promise<boolean> => {
    setIsChecking(true)
    try {
      const available = await isCloudSyncAvailable()
      setIsAvailable(available)
      return available
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  return { isAvailable, isChecking, check }
}
