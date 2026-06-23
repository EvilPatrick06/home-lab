import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for the web shim's IndexedDB persistence layer.
const store = new Map<string, Record<string, unknown>>()
vi.mock('./idb', () => ({
  idbGet: vi.fn(async (_s: string, key: string) => store.get(key)),
  idbSet: vi.fn(async (_s: string, key: string, value: Record<string, unknown>) => {
    store.set(key, value)
  }),
  idbDelete: vi.fn(async () => {}),
  idbGetAll: vi.fn(async () => []),
  idbKeys: vi.fn(async () => []),
  idbWipeAll: vi.fn(async () => {})
}))

import { createWebApi } from './web-api'

function makeChar(id: string): Record<string, unknown> {
  return {
    id,
    schemaVersion: 4,
    name: 'Aria',
    level: 3,
    hitPoints: { current: 5, maximum: 20, temporary: 3 },
    deathSaves: { successes: 0, failures: 0 },
    equipment: [],
    treasure: {},
    features: [],
    skills: [],
    spellSlotLevels: { 1: { current: 0, max: 2 } },
    pactMagicSlotLevels: { 1: { current: 0, max: 1 } },
    classResources: [{ name: 'Channel Divinity', current: 0, max: 2, shortRestRestore: 'all' }],
    hitDice: [{ die: 'd8', current: 1, maximum: 3 }],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    }
  }
}

describe('web ai.longRest / ai.shortRest (desktop parity)', () => {
  beforeEach(() => store.clear())

  it('long rest restores HP, clears temp HP, and refills spell slots', async () => {
    store.set('c1', makeChar('c1'))
    const api = createWebApi()
    const res = (await api.ai.longRest('c1')) as { applied: unknown[]; rejected: unknown[] }
    expect(res.applied.length).toBeGreaterThan(0)
    const c = store.get('c1') as {
      hitPoints: { current: number; temporary: number }
      spellSlotLevels: Record<string, { current: number }>
      pactMagicSlotLevels: Record<string, { current: number }>
    }
    expect(c.hitPoints.current).toBe(20)
    expect(c.hitPoints.temporary).toBe(0)
    expect(c.spellSlotLevels['1'].current).toBe(2)
    expect(c.pactMagicSlotLevels['1'].current).toBe(1)
  })

  it('short rest restores pact slots and short-rest class resources, not HP', async () => {
    store.set('c2', makeChar('c2'))
    const api = createWebApi()
    const res = (await api.ai.shortRest('c2')) as { applied: unknown[]; rejected: unknown[] }
    expect(res.applied.length).toBeGreaterThan(0)
    const c = store.get('c2') as {
      hitPoints: { current: number }
      pactMagicSlotLevels: Record<string, { current: number }>
      classResources: Array<{ current: number }>
      spellSlotLevels: Record<string, { current: number }>
    }
    expect(c.pactMagicSlotLevels['1'].current).toBe(1)
    expect(c.classResources[0].current).toBe(2)
    expect(c.hitPoints.current).toBe(5) // short rest does not heal
    expect(c.spellSlotLevels['1'].current).toBe(0) // regular slots untouched
  })

  it('rest on a missing character reports not found and persists nothing', async () => {
    const api = createWebApi()
    const res = (await api.ai.longRest('missing')) as { applied: unknown[]; rejected: Array<{ reason: string }> }
    expect(res.applied).toHaveLength(0)
    expect(res.rejected[0].reason).toBe('Character not found')
    expect(store.size).toBe(0)
  })
})
