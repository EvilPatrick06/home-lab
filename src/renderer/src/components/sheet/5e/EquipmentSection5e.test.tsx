import { describe, expect, it, vi } from 'vitest'

vi.mock('../shared/SheetSectionWrapper', () => ({ default: () => null }))
vi.mock('./CharacterTraitsPanel5e', () => ({ default: () => null }))
vi.mock('./CoinBadge5e', () => ({ default: () => null }))
vi.mock('./EquipmentListPanel5e', () => ({ default: () => null }))
vi.mock('./MagicItemsPanel5e', () => ({ default: () => null }))

describe('EquipmentSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./EquipmentSection5e')
    expect(mod).toBeDefined()
  })
})
