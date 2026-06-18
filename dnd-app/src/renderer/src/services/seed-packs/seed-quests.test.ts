// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeedPack } from './seed-pack-schema'
import { seedQuestsFromPack } from './seed-quests'

const seedQuests = vi.fn(async () => ({ success: true, added: 2 }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { api: { ai: { seedQuests } } })
})

const QUESTS: SeedPack['quests'] = [
  { name: 'Q1', description: 'd', objectives: ['o1', 'o2'], chapterQuest: true },
  { name: 'Q2', description: '', objectives: [], chapterQuest: false }
]

describe('seedQuestsFromPack (PHASE-37 37D)', () => {
  it('no-ops (added:0, no IPC) for empty/undefined', async () => {
    expect(await seedQuestsFromPack('c1', undefined)).toEqual({ success: true, added: 0 })
    expect(await seedQuestsFromPack('c1', [])).toEqual({ success: true, added: 0 })
    expect(seedQuests).not.toHaveBeenCalled()
  })

  it('forwards the quests to the IPC bridge', async () => {
    const r = await seedQuestsFromPack('c1', QUESTS)
    expect(r.success).toBe(true)
    expect(seedQuests).toHaveBeenCalledWith(
      'c1',
      expect.arrayContaining([expect.objectContaining({ name: 'Q1', chapterQuest: true })])
    )
  })

  it('catches a bridge failure into an error envelope (never throws)', async () => {
    seedQuests.mockRejectedValueOnce(new Error('boom'))
    const r = await seedQuestsFromPack('c1', QUESTS)
    expect(r.success).toBe(false)
    expect(r.error).toBe('boom')
  })
})
