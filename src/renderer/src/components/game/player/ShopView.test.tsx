import { describe, expect, it } from 'vitest'

describe('ShopView', () => {
  it('can be imported', async () => {
    const mod = await import('./ShopView')
    expect(mod).toBeDefined()
  })
})
