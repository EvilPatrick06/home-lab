import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Provide localStorage stub
const storageMap = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key))
})

// Provide crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'auto-save-uuid' })

describe('auto-save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMap.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exports expected public API', async () => {
    const mod = await import('./auto-save')
    expect(typeof mod.startAutoSave).toBe('function')
    expect(typeof mod.stopAutoSave).toBe('function')
    expect(typeof mod.saveNow).toBe('function')
    expect(typeof mod.getSaveVersions).toBe('function')
    expect(typeof mod.restoreVersion).toBe('function')
    expect(typeof mod.deleteVersion).toBe('function')
    expect(typeof mod.setConfig).toBe('function')
    expect(typeof mod.getConfig).toBe('function')
    expect(typeof mod.isRunning).toBe('function')
  })

  it('getConfig returns default config', async () => {
    const { getConfig } = await import('./auto-save')
    const cfg = getConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.intervalMs).toBe(5 * 60 * 1000)
    expect(cfg.maxVersions).toBe(10)
  })

  it('setConfig merges partial config and persists to localStorage', async () => {
    const { setConfig, getConfig } = await import('./auto-save')
    setConfig({ maxVersions: 5 })
    const cfg = getConfig()
    expect(cfg.maxVersions).toBe(5)
    expect(cfg.enabled).toBe(true) // Unchanged
    expect(localStorage.setItem).toHaveBeenCalled()
  })

  it('isRunning returns false when no timer is active', async () => {
    const { isRunning, stopAutoSave } = await import('./auto-save')
    stopAutoSave()
    expect(isRunning()).toBe(false)
  })

  it('startAutoSave starts the timer and isRunning returns true', async () => {
    const { startAutoSave, isRunning, stopAutoSave } = await import('./auto-save')
    startAutoSave('camp-1', () => ({ round: 1 }))
    expect(isRunning()).toBe(true)
    stopAutoSave()
    expect(isRunning()).toBe(false)
  })

  it('stopAutoSave clears the timer', async () => {
    const { startAutoSave, stopAutoSave, isRunning } = await import('./auto-save')
    startAutoSave('camp-1', () => ({}))
    stopAutoSave()
    expect(isRunning()).toBe(false)
  })

  it('saveNow persists data immediately', async () => {
    const { saveNow, getSaveVersions } = await import('./auto-save')
    await saveNow('camp-1', { round: 3 }, 'Manual save')
    const versions = getSaveVersions('camp-1')
    expect(versions.length).toBeGreaterThanOrEqual(1)
    expect(versions[0].label).toBe('Manual save')
  })

  it('restoreVersion returns saved data', async () => {
    const { saveNow, getSaveVersions, restoreVersion } = await import('./auto-save')
    await saveNow('camp-2', { test: 'data' })
    const versions = getSaveVersions('camp-2')
    expect(versions.length).toBeGreaterThanOrEqual(1)
    const data = await restoreVersion('camp-2', versions[0].id)
    expect(data).toEqual({ test: 'data' })
  })

  it('restoreVersion returns null for unknown version', async () => {
    const { restoreVersion } = await import('./auto-save')
    const data = await restoreVersion('camp-x', 'nonexistent-id')
    expect(data).toBeNull()
  })

  it('deleteVersion removes a version', async () => {
    const { saveNow, getSaveVersions, deleteVersion } = await import('./auto-save')
    await saveNow('camp-3', { x: 1 })
    const versions = getSaveVersions('camp-3')
    const versionId = versions[0].id
    deleteVersion('camp-3', versionId)
    expect(localStorage.removeItem).toHaveBeenCalled()
  })

  it('getSaveVersions returns versions sorted newest first', async () => {
    const { saveNow, getSaveVersions } = await import('./auto-save')
    await saveNow('camp-4', { round: 1 })
    vi.advanceTimersByTime(1000)
    await saveNow('camp-4', { round: 2 })

    const versions = getSaveVersions('camp-4')
    expect(versions.length).toBeGreaterThanOrEqual(2)
    expect(versions[0].timestamp).toBeGreaterThanOrEqual(versions[1].timestamp)
  })

  it('startAutoSave does not start timer when config disabled', async () => {
    const { setConfig, startAutoSave, isRunning, stopAutoSave } = await import('./auto-save')
    setConfig({ enabled: false })
    startAutoSave('camp-5', () => ({}))
    expect(isRunning()).toBe(false)
    // Re-enable for other tests
    setConfig({ enabled: true })
    stopAutoSave()
  })
})
