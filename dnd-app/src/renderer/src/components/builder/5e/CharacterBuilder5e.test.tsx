import { describe, expect, it, vi } from 'vitest'

vi.mock('./MainContentArea5e', () => ({ default: () => null }))
vi.mock('./CharacterSummaryBar5e', () => ({ default: () => null }))
vi.mock('../shared/BuildSidebar', () => ({ default: () => null }))

describe('CharacterBuilder5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CharacterBuilder5e')
    expect(mod).toBeDefined()
  })
})
