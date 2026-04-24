import { describe, expect, it } from 'vitest'

describe('EquipmentListPanel5e', () => {
  it('can be imported', async () => {
    const mod = await import('./EquipmentListPanel5e')
    expect(mod).toBeDefined()
  })
})
