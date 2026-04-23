import { describe, expect, it } from 'vitest'

describe('ShopInventoryTable', () => {
  it('can be imported', async () => {
    const mod = await import('./ShopInventoryTable')
    expect(mod).toBeDefined()
  })
})
