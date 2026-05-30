import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the underlying file logger so we capture calls without touching disk.
vi.mock('./log', () => ({
  logToFile: vi.fn()
}))

import { logToFile } from './log'
import { logSecurityEvent } from './security-log'

const MAX_DETAILS_BYTES = 4 * 1024

describe('logSecurityEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes the event to logToFile under the SECURITY level', () => {
    logSecurityEvent('login.failure', { ip: '10.0.0.1' })

    expect(logToFile).toHaveBeenCalledOnce()
    const [level] = vi.mocked(logToFile).mock.calls[0]
    expect(level).toBe('SECURITY')
  })

  it('prefixes the message with the event name', () => {
    logSecurityEvent('csp.violation', { directive: 'script-src' })

    const [, message] = vi.mocked(logToFile).mock.calls[0]
    expect(String(message).startsWith('csp.violation ')).toBe(true)
  })

  it('JSON-stringifies the details object into the message', () => {
    logSecurityEvent('upload.rejected', { reason: 'bad-mime', size: 42 })

    const [, message] = vi.mocked(logToFile).mock.calls[0]
    expect(message).toContain('"reason":"bad-mime"')
    expect(message).toContain('"size":42')
  })

  it('defaults to an empty object when details are omitted', () => {
    logSecurityEvent('app.startup')

    const [, message] = vi.mocked(logToFile).mock.calls[0]
    expect(message).toBe('app.startup {}')
  })

  it('truncates oversized details (>4 KB) and marks them truncated', () => {
    // A single string value large enough that JSON.stringify exceeds 4 KB.
    const huge = 'x'.repeat(MAX_DETAILS_BYTES + 500)
    logSecurityEvent('payload.oversize', { blob: huge })

    const [, message] = vi.mocked(logToFile).mock.calls[0] as [string, string]
    expect(message).toContain('…(truncated)')
    // event name (+ space) + at most MAX_DETAILS_BYTES of JSON + the suffix.
    const detailsStr = message.slice('payload.oversize '.length)
    expect(detailsStr.endsWith('…(truncated)')).toBe(true)
    expect(detailsStr.length).toBe(MAX_DETAILS_BYTES + '…(truncated)'.length)
  })

  it('does not truncate details at or below the 4 KB cap', () => {
    logSecurityEvent('payload.small', { note: 'tiny' })

    const [, message] = vi.mocked(logToFile).mock.calls[0] as [string, string]
    expect(message).not.toContain('…(truncated)')
  })

  it('falls back to an error string when details are unserializable', () => {
    // A circular reference makes JSON.stringify throw.
    const circular: Record<string, unknown> = {}
    circular.self = circular
    logSecurityEvent('serialize.fail', circular)

    const [, message] = vi.mocked(logToFile).mock.calls[0]
    expect(message).toBe('serialize.fail {"error":"unserializable details"}')
  })

  it('does not pass a stack argument to logToFile', () => {
    logSecurityEvent('no.stack', { a: 1 })

    const call = vi.mocked(logToFile).mock.calls[0]
    expect(call.length).toBe(2)
    expect(call[2]).toBeUndefined()
  })
})
