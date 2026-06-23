import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for the web shim's IndexedDB persistence layer, so the test
// exercises the REAL apply path (web `ai.applyMutations` -> applyChangesToCharacter)
// without a browser IndexedDB.
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
    hitPoints: { current: 20, maximum: 20, temporary: 0 },
    deathSaves: { successes: 0, failures: 0 },
    equipment: [],
    treasure: {},
    features: [],
    skills: [],
    hitDice: [],
    classResources: [],
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

describe('web ai.applyMutations (desktop parity)', () => {
  beforeEach(() => store.clear())

  it('applies damage to the persisted character and saves it', async () => {
    store.set('c1', makeChar('c1'))
    const api = createWebApi()
    const res = (await api.ai.applyMutations('c1', [{ type: 'damage', value: 7, reason: 'goblin arrow' }])) as {
      applied: unknown[]
      rejected: unknown[]
    }
    expect(res.applied).toHaveLength(1)
    expect(res.rejected).toHaveLength(0)
    expect((store.get('c1') as { hitPoints: { current: number } }).hitPoints.current).toBe(13)
  })

  it('applies a condition (e.g. poisoned) to the persisted character', async () => {
    store.set('c2', makeChar('c2'))
    const api = createWebApi()
    const res = (await api.ai.applyMutations('c2', [
      { type: 'add_condition', name: 'Poisoned', reason: 'failed save' }
    ])) as { applied: unknown[]; rejected: unknown[] }
    expect(res.applied).toHaveLength(1)
    const saved = store.get('c2') as Record<string, unknown>
    expect(JSON.stringify(saved)).toContain('oisoned')
  })

  it('rejects when the character is not found and persists nothing', async () => {
    const api = createWebApi()
    const res = (await api.ai.applyMutations('missing', [{ type: 'damage', value: 5, reason: 'x' }])) as {
      applied: unknown[]
      rejected: Array<{ reason: string }>
    }
    expect(res.applied).toHaveLength(0)
    expect(res.rejected).toHaveLength(1)
    expect(res.rejected[0].reason).toBe('Character not found')
    expect(store.size).toBe(0)
  })
})
