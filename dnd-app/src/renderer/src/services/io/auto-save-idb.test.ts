// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Quiet the toast side-channel; we assert on storage behavior here.
vi.mock('../../hooks/use-toast', () => ({ addToast: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  if (typeof crypto === 'undefined' || !crypto.randomUUID) {
    vi.stubGlobal('crypto', { randomUUID: () => 'idb-test-uuid' })
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auto-save with IndexedDB backend', () => {
  it('stores snapshot bodies in IndexedDB (not localStorage) and restores them', async () => {
    const { saveNow, getSaveVersions, restoreVersion } = await import('./auto-save')

    await saveNow('camp-idb', { round: 7, foo: 'bar' })

    const versions = getSaveVersions('camp-idb')
    expect(versions.length).toBe(1)
    const vid = versions[0].id

    // The heavy body must NOT live in localStorage — IndexedDB owns it now.
    expect(localStorage.getItem(`autosave:camp-idb:${vid}`)).toBeNull()

    // Restore reads the body back from IndexedDB.
    const restored = await restoreVersion('camp-idb', vid)
    expect(restored).toEqual({ round: 7, foo: 'bar' })
  })

  it('deleteVersion drops the version from the manifest and the body store', async () => {
    const { saveNow, getSaveVersions, deleteVersion, restoreVersion } = await import('./auto-save')

    await saveNow('camp-del', { round: 1 })
    const vid = getSaveVersions('camp-del')[0].id

    deleteVersion('camp-del', vid)
    // manifest update is synchronous
    expect(getSaveVersions('camp-del').find((v) => v.id === vid)).toBeUndefined()

    // let the fire-and-forget IndexedDB delete settle, then confirm the body is gone
    await new Promise((r) => setTimeout(r, 10))
    expect(await restoreVersion('camp-del', vid)).toBeNull()
  })
})
