import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDateStamp } from './local-date'

describe('localDateStamp', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats a given date as zero-padded YYYY-MM-DD from LOCAL parts', () => {
    const d = new Date(2026, 0, 5, 20, 30) // Jan 5 2026, local
    expect(localDateStamp(d)).toBe('2026-01-05')
  })

  it('uses local date parts, not the UTC toISOString slice', () => {
    // 01:30 UTC — west of UTC this is still the previous local evening. The
    // stamp must follow the LOCAL wall-clock date, matching the export/header.
    vi.useFakeTimers()
    const now = new Date('2026-07-15T01:30:00Z')
    vi.setSystemTime(now)
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(localDateStamp()).toBe(expected)
  })

  it('defaults to now when called with no argument', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0))
    expect(localDateStamp()).toBe('2026-06-09')
  })
})
