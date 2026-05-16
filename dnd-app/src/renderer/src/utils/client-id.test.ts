import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getOrCreateClientId, resetClientIdCache } from './client-id'

const STORAGE_KEY = 'dndapp:client-id'

const storageState = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => (storageState.has(key) ? (storageState.get(key) ?? null) : null)),
  setItem: vi.fn((key: string, value: string) => {
    storageState.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    storageState.delete(key)
  }),
  clear: vi.fn(() => {
    storageState.clear()
  })
})

describe('getOrCreateClientId', () => {
  beforeEach(() => {
    storageState.clear()
    resetClientIdCache()
  })

  it('generates and persists a UUID on first call', () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    const id = getOrCreateClientId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(id)
  })

  it('returns the same value across calls within a session', () => {
    const first = getOrCreateClientId()
    const second = getOrCreateClientId()
    expect(second).toBe(first)
  })

  it('reads the existing value after cache reset (simulates reload)', () => {
    const first = getOrCreateClientId()
    resetClientIdCache()
    const second = getOrCreateClientId()
    expect(second).toBe(first)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(first)
  })

  it('regenerates after the storage entry is cleared', () => {
    const first = getOrCreateClientId()
    localStorage.clear()
    resetClientIdCache()
    const second = getOrCreateClientId()
    expect(second).not.toBe(first)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(second)
  })
})
