import { describe, expect, it } from 'vitest'

describe('ShopCustomItemForm', () => {
  it('can be imported', async () => {
    const mod = await import('./ShopCustomItemForm')
    expect(mod).toBeDefined()
  })
})
