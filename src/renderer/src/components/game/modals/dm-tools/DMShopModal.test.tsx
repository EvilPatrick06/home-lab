import { describe, expect, it } from 'vitest'

describe('DMShopModal', () => {
  it('can be imported', async () => {
    const mod = await import('./DMShopModal')
    expect(mod).toBeDefined()
  })
})
