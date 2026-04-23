import { describe, expect, it, vi } from 'vitest'

vi.mock('./modal-groups/CombatModals', () => ({ default: () => null }))
vi.mock('./modal-groups/DmModals', () => ({ default: () => null }))
vi.mock('./modal-groups/MechanicsModals', () => ({ default: () => null }))
vi.mock('./modal-groups/UtilityModals', () => ({ default: () => null }))

describe('GameModalDispatcher', () => {
  it('can be imported', async () => {
    const mod = await import('./GameModalDispatcher')
    expect(mod).toBeDefined()
  })
})
