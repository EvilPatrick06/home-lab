import { describe, expect, it } from 'vitest'

describe('ShopPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./ShopPanel')
    expect(mod).toBeDefined()
  })
})
