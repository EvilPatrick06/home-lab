import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 20a — exercise encrypt/decrypt round-trip + the graceful plaintext
// fallback when the OS keystore is unavailable.

let encryptionAvailable = true

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    // Reversible stand-in for the OS keystore: prefix-tag the bytes so we can
    // assert the stored form differs from plaintext and decrypts back exactly.
    encryptString: (plain: string) => Buffer.from(`ENC:${plain}`, 'utf-8'),
    decryptString: (buf: Buffer) => buf.toString('utf-8').replace(/^ENC:/, '')
  }
}))

vi.mock('../log', () => ({ logToFile: vi.fn() }))

import { decryptOptional, encryptOptional } from './safe-secret-storage'

describe('safe-secret-storage', () => {
  beforeEach(() => {
    encryptionAvailable = true
  })

  it('round-trips a value through encrypt → decrypt', () => {
    const secret = 'sk-ant-supersecret-key'
    const stored = encryptOptional(secret)
    expect(decryptOptional(stored)).toBe(secret)
  })

  it('stored form differs from plaintext and carries the ss1: marker', () => {
    const secret = 'sk-ant-supersecret-key'
    const stored = encryptOptional(secret)
    expect(stored).not.toBe(secret)
    expect(stored?.startsWith('ss1:')).toBe(true)
    expect(stored).not.toContain(secret)
  })

  it('passes through empty / undefined untouched', () => {
    expect(encryptOptional(undefined)).toBeUndefined()
    expect(encryptOptional('')).toBe('')
    expect(decryptOptional(undefined)).toBeUndefined()
  })

  it('passes legacy plaintext (no ss1: prefix) through decrypt unchanged', () => {
    expect(decryptOptional('plain-legacy-token')).toBe('plain-legacy-token')
  })

  it('falls back to plaintext when the OS keystore is unavailable', () => {
    encryptionAvailable = false
    const secret = 'sk-ant-supersecret-key'
    const stored = encryptOptional(secret)
    expect(stored).toBe(secret) // no ss1: prefix, stored as-is
    expect(decryptOptional(stored)).toBe(secret)
  })
})
