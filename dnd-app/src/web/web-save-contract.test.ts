import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, Record<string, unknown>>()
vi.mock('./idb', () => ({
  idbGet: vi.fn(async (_s: string, key: string) => store.get(key)),
  idbSet: vi.fn(async (_s: string, key: string, value: Record<string, unknown>) => {
    store.set(key, value)
  }),
  idbDelete: vi.fn(async () => {}),
  idbGetAll: vi.fn(async () => [...store.values()]),
  idbKeys: vi.fn(async () => [...store.keys()]),
  idbWipeAll: vi.fn(async () => store.clear())
}))

import { createWebApi } from './web-api'

describe('web shim saveEntity — { success } contract (PHASE-47 F1)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: shim api is intentionally loose
  let api: any
  beforeEach(() => {
    store.clear()
    api = createWebApi()
  })

  it('saveBastion resolves { success: true } (so the store guard !result.success passes)', async () => {
    const r = await api.saveBastion({ name: 'Keep' })
    expect(r.success).toBe(true)
    expect(typeof r.id).toBe('string') // id still exposed for callers that read it
  })

  it('saveCharacter resolves { success: true } and persists the entity (without polluting it)', async () => {
    const r = await api.saveCharacter({ name: 'Aria' })
    expect(r.success).toBe(true)
    const persisted = store.get(r.id as string)
    expect(persisted?.name).toBe('Aria')
    // `success` is a return-only flag; it must NOT be written into the record.
    expect('success' in (persisted ?? {})).toBe(false)
  })

  it('saveCampaign and saveCustomCreature also honor the contract', async () => {
    expect((await api.saveCampaign({ name: 'C' })).success).toBe(true)
    expect((await api.saveCustomCreature({ name: 'Goblin' })).success).toBe(true)
  })
})
