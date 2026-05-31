import { describe, expect, it } from 'vitest'
import { BACKUP_STALE_DAYS, backupStaleness, isBackupStale } from './backup-staleness'

const NOW = Date.parse('2026-05-31T00:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()

describe('backup-staleness', () => {
  it('never nags when there is no recorded backup', () => {
    expect(isBackupStale(undefined, NOW)).toBe(false)
    expect(backupStaleness(undefined, NOW)).toEqual({ stale: false, daysSince: null })
  })

  it('treats an unparseable timestamp as not-stale (defensive)', () => {
    expect(isBackupStale('not-a-date', NOW)).toBe(false)
  })

  it('is not stale within the threshold window', () => {
    expect(isBackupStale(daysAgo(1), NOW)).toBe(false)
    expect(isBackupStale(daysAgo(BACKUP_STALE_DAYS), NOW)).toBe(false) // boundary: exactly 14 days
  })

  it('is stale past the threshold', () => {
    expect(isBackupStale(daysAgo(BACKUP_STALE_DAYS + 1), NOW)).toBe(true)
    expect(isBackupStale(daysAgo(100), NOW)).toBe(true)
  })

  it('reports whole days since the last backup', () => {
    expect(backupStaleness(daysAgo(20), NOW)).toEqual({ stale: true, daysSince: 20 })
  })
})
