import { afterEach, describe, expect, it, vi } from 'vitest'
import { auditSecurityEvent } from './security-audit'

// Restore the global window between cases so each test controls its own shape.
const originalWindow = (globalThis as { window?: unknown }).window

afterEach(() => {
  ;(globalThis as { window?: unknown }).window = originalWindow
  vi.restoreAllMocks()
})

function setWindow(api: unknown): void {
  ;(globalThis as { window?: unknown }).window = { api }
}

describe('auditSecurityEvent', () => {
  it('forwards event + details to window.api.logSecurityEvent', () => {
    const logSecurityEvent = vi.fn().mockResolvedValue(undefined)
    setWindow({ logSecurityEvent })
    auditSecurityEvent('host.kick', { peerId: 'p1' })
    expect(logSecurityEvent).toHaveBeenCalledWith('host.kick', { peerId: 'p1' })
  })

  it('defaults details to an empty object', () => {
    const logSecurityEvent = vi.fn().mockResolvedValue(undefined)
    setWindow({ logSecurityEvent })
    auditSecurityEvent('network.message_rejected')
    expect(logSecurityEvent).toHaveBeenCalledWith('network.message_rejected', {})
  })

  it('is a no-op (no throw) when window.api is absent', () => {
    setWindow(undefined)
    expect(() => auditSecurityEvent('host.ban', { peerId: 'p2' })).not.toThrow()
  })

  it('swallows a rejected audit promise (best-effort)', async () => {
    const logSecurityEvent = vi.fn().mockRejectedValue(new Error('ipc down'))
    setWindow({ logSecurityEvent })
    // Must not throw synchronously and the rejection must be caught internally.
    expect(() => auditSecurityEvent('host.kick')).not.toThrow()
    await Promise.resolve()
    expect(logSecurityEvent).toHaveBeenCalled()
  })
})
