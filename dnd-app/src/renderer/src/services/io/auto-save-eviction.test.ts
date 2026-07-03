import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Quota-eviction behavior when snapshot bodies live in IndexedDB.
//
// Regression tests for the eviction path ignoring the IDB body store: the
// fallback loop used a raw `localStorage.removeItem`, so an IDB-outage
// fallback (bodies in IDB, localStorage at quota) freed nothing per iteration,
// drained the entire version manifest, and orphaned every IDB-resident body.
// ---------------------------------------------------------------------------

// Map-backed localStorage whose setItem can simulate per-key quota pressure.
const storageMap = new Map<string, string>()
const quota = { fullFor: null as ((key: string) => boolean) | null }
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    if (quota.fullFor?.(key)) throw new DOMException('quota exceeded', 'QuotaExceededError')
    storageMap.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    storageMap.delete(key)
  })
})

vi.stubGlobal('crypto', { randomUUID: () => 'evict-uuid' })

vi.mock('../../hooks/use-toast', () => ({ addToast: vi.fn() }))

// Simulated IndexedDB body store: available but with failing puts (a
// mid-session IDB outage), recording deletes so both-backend eviction is
// assertable.
const idb = vi.hoisted(() => ({
  available: false,
  deleted: [] as string[]
}))
vi.mock('./autosave-snapshot-store', () => ({
  idbAvailable: () => idb.available,
  idbPutSnapshot: async () => {
    throw new Error('simulated IndexedDB outage')
  },
  idbGetSnapshot: async () => null,
  idbDeleteSnapshot: async (key: string) => {
    idb.deleted.push(key)
  }
}))

const manifestKey = (campaignId: string) => `autosave:${campaignId}:versions`
const bodyKey = (campaignId: string, versionId: string) => `autosave:${campaignId}:${versionId}`

describe('auto-save quota eviction with an IndexedDB-backed history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageMap.clear()
    quota.fullFor = null
    idb.available = true
    idb.deleted = []
  })

  it('evicts a localStorage-resident body from BOTH backends and completes the save', async () => {
    const { saveNow, getSaveVersions } = await import('./auto-save')
    const { addToast } = await import('../../hooks/use-toast')

    // History: one legacy localStorage-resident version.
    storageMap.set(manifestKey('camp-a'), JSON.stringify([{ id: 'v-legacy', timestamp: 1000, label: 'legacy' }]))
    storageMap.set(bodyKey('camp-a', 'v-legacy'), '"legacy-body"')

    // localStorage is "full" for snapshot bodies until the legacy body goes.
    quota.fullFor = (key) => key !== manifestKey('camp-a') && storageMap.has(bodyKey('camp-a', 'v-legacy'))

    await saveNow('camp-a', { round: 4 })

    // Evicted from both backends, not just localStorage.
    expect(idb.deleted).toContain(bodyKey('camp-a', 'v-legacy'))
    expect(storageMap.has(bodyKey('camp-a', 'v-legacy'))).toBe(false)

    // The save landed; no loud failure.
    const versions = getSaveVersions('camp-a')
    expect(versions.length).toBe(1)
    expect(versions[0].id).not.toBe('v-legacy')
    expect(addToast).not.toHaveBeenCalled()
  })

  it('does NOT drain the manifest or touch IDB bodies when eviction cannot free quota', async () => {
    const { saveNow, getSaveVersions } = await import('./auto-save')
    const { addToast } = await import('../../hooks/use-toast')

    // History: three IndexedDB-resident versions (no localStorage bodies).
    storageMap.set(
      manifestKey('camp-b'),
      JSON.stringify([
        { id: 'v-idb-1', timestamp: 1000, label: 'one' },
        { id: 'v-idb-2', timestamp: 2000, label: 'two' },
        { id: 'v-idb-3', timestamp: 3000, label: 'three' }
      ])
    )

    // Quota pressure that eviction cannot relieve (the bodies are not here).
    quota.fullFor = (key) => key !== manifestKey('camp-b')

    await saveNow('camp-b', { round: 9 })

    // Fails loud, but the restore history survives intact — nothing orphaned.
    expect(addToast).toHaveBeenCalled()
    expect((addToast as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]).toBe('error')
    expect(
      getSaveVersions('camp-b')
        .map((v) => v.id)
        .sort()
    ).toEqual(['v-idb-1', 'v-idb-2', 'v-idb-3'])
    expect(idb.deleted).toEqual([])
  })

  it('still drains localStorage-resident history for a genuinely oversized snapshot', async () => {
    const { saveNow, getSaveVersions } = await import('./auto-save')
    const { addToast } = await import('../../hooks/use-toast')

    idb.available = false // pure localStorage mode (pre-IDB behavior preserved)
    storageMap.set(
      manifestKey('camp-c'),
      JSON.stringify([
        { id: 'v-ls-1', timestamp: 1000, label: 'one' },
        { id: 'v-ls-2', timestamp: 2000, label: 'two' }
      ])
    )
    storageMap.set(bodyKey('camp-c', 'v-ls-1'), '"b1"')
    storageMap.set(bodyKey('camp-c', 'v-ls-2'), '"b2"')

    // The new body never fits, even on an emptied store.
    quota.fullFor = (key) => key !== manifestKey('camp-c')

    await saveNow('camp-c', { round: 1 })

    expect(addToast).toHaveBeenCalled()
    expect(getSaveVersions('camp-c')).toEqual([])
    expect(storageMap.has(bodyKey('camp-c', 'v-ls-1'))).toBe(false)
    expect(storageMap.has(bodyKey('camp-c', 'v-ls-2'))).toBe(false)
  })
})
