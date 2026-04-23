import { describe, expect, it } from 'vitest'

describe('EquipmentShop5e', () => {
  it('can be imported', async () => {
    const mod = await import('./EquipmentShop5e')
    expect(mod).toBeDefined()
  })
})
