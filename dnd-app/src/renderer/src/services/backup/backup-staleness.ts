/**
 * Phase R3 — backup-staleness check for the on-launch nudge.
 *
 * Pure + deterministic (pass `now` in tests). A fresh install with no recorded
 * backup is NOT stale (don't nag users who've never backed up / have nothing to
 * back up — the caller additionally gates the nudge on "campaigns exist").
 */
export const BACKUP_STALE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export interface BackupStaleness {
  stale: boolean
  /** Whole days since the last backup, or null if never backed up. */
  daysSince: number | null
}

export function backupStaleness(lastBackupTime: string | undefined, now: number = Date.now()): BackupStaleness {
  if (!lastBackupTime) return { stale: false, daysSince: null }
  const ts = Date.parse(lastBackupTime)
  if (Number.isNaN(ts)) return { stale: false, daysSince: null }
  const daysSince = Math.floor((now - ts) / DAY_MS)
  return { stale: daysSince > BACKUP_STALE_DAYS, daysSince }
}

/** Convenience boolean wrapper. */
export function isBackupStale(lastBackupTime: string | undefined, now: number = Date.now()): boolean {
  return backupStaleness(lastBackupTime, now).stale
}
