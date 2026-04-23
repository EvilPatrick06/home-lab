import { describe, expect, it, vi } from 'vitest'

vi.mock('../../components/game/dm', () => ({
  MonsterStatBlockView: () => null
}))
vi.mock('../../components/game/dm/StatBlockEditor', () => ({
  default: () => null
}))

describe('NPCManager', () => {
  it('can be imported', async () => {
    const mod = await import('./NPCManager')
    expect(mod).toBeDefined()
  })
})
