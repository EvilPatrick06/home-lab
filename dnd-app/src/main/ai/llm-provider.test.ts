import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOUD_FIRST_TOKEN_TIMEOUT_MS, CLOUD_INACTIVITY_TIMEOUT_MS, createStreamInactivityGuard } from './llm-provider'

describe('createStreamInactivityGuard (PHASE-03 03A)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('aborts at firstTokenMs when never bumped', () => {
    const g = createStreamInactivityGuard({ firstTokenMs: 1000, inactivityMs: 1000 })
    expect(g.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(g.signal.aborted).toBe(true)
    expect(g.timedOut()).toBe(true)
  })

  it('bump() before expiry defers the abort, then inactivity fires', () => {
    const g = createStreamInactivityGuard({ firstTokenMs: 1000, inactivityMs: 2000 })
    vi.advanceTimersByTime(900)
    g.bump() // tokens arriving — re-arm with inactivityMs
    vi.advanceTimersByTime(1500)
    expect(g.signal.aborted).toBe(false) // 1500 < 2000 inactivity window
    vi.advanceTimersByTime(600)
    expect(g.signal.aborted).toBe(true) // now past the 2000 inactivity window
    expect(g.timedOut()).toBe(true)
  })

  it('clear() prevents any abort', () => {
    const g = createStreamInactivityGuard({ firstTokenMs: 500 })
    g.clear()
    vi.advanceTimersByTime(10_000)
    expect(g.signal.aborted).toBe(false)
    expect(g.timedOut()).toBe(false)
  })

  it("caller's signal aborting marks the combined signal aborted but NOT timedOut", () => {
    const caller = new AbortController()
    const g = createStreamInactivityGuard({ firstTokenMs: 10_000, signal: caller.signal })
    caller.abort()
    expect(g.signal.aborted).toBe(true)
    expect(g.timedOut()).toBe(false)
  })

  it('defaults pull from the exported constants', () => {
    const g = createStreamInactivityGuard()
    expect(g.signal.aborted).toBe(false)
    vi.advanceTimersByTime(CLOUD_FIRST_TOKEN_TIMEOUT_MS - 1)
    expect(g.signal.aborted).toBe(false)
    vi.advanceTimersByTime(2)
    expect(g.signal.aborted).toBe(true)
    g.clear()
    expect(CLOUD_INACTIVITY_TIMEOUT_MS).toBeGreaterThan(0)
  })
})
