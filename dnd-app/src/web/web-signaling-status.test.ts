import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for the web shim's IndexedDB persistence layer.
vi.mock('./idb', () => ({
  idbGet: vi.fn(async () => undefined),
  idbSet: vi.fn(async () => {}),
  idbDelete: vi.fn(async () => {}),
  idbGetAll: vi.fn(async () => []),
  idbKeys: vi.fn(async () => []),
  idbWipeAll: vi.fn(async () => {})
}))

import { createWebApi } from './web-api'

describe('web shim — signaling status (PHASE-45 F5)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: shim api is intentionally loose
  let api: any
  beforeEach(() => {
    api = createWebApi()
  })

  it('drives a terminal { reachable: null } into onBmoSignalingStatus subscribers on probe', async () => {
    const seen: Array<{ reachable: boolean | null; host: string; port: number }> = []
    const unsub = api.lan.onBmoSignalingStatus((p: { reachable: boolean | null; host: string; port: number }) =>
      seen.push(p)
    )
    // Before a probe, nothing has been emitted (badge would be "Checking…").
    expect(seen).toHaveLength(0)
    await api.lan.probeSignaling()
    // After a probe, exactly one terminal status with reachable === null
    // (→ the store sets checkedAt, badge renders "Not applicable").
    expect(seen).toHaveLength(1)
    expect(seen[0].reachable).toBeNull()
    unsub()
  })

  it('unsubscribe stops further callbacks', async () => {
    const seen: unknown[] = []
    const unsub = api.lan.onBmoSignalingStatus((p: unknown) => seen.push(p))
    unsub()
    await api.lan.probeSignaling()
    expect(seen).toHaveLength(0)
  })
})
