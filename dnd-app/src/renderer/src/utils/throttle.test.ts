import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { throttle } from './throttle'

describe('throttle (Phase 22k)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires immediately on the leading edge', () => {
    const fn = vi.fn()
    const t = throttle(fn, 100)
    t('a')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenLastCalledWith('a')
  })

  it('collapses a rapid burst to one leading + one trailing call', () => {
    const fn = vi.fn()
    const t = throttle(fn, 100)
    t('a') // leading
    t('b')
    t('c') // latest wins for trailing
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('c')
  })

  it('cancel() drops the pending trailing call', () => {
    const fn = vi.fn()
    const t = throttle(fn, 100)
    t('a')
    t('b')
    t.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1) // only the leading call ran
  })

  it('ms <= 0 short-circuits to pass-through', () => {
    const fn = vi.fn()
    const t = throttle(fn, 0)
    t('a')
    t('b')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
