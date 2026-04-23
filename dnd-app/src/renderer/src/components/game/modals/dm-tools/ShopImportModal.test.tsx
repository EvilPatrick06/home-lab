import { describe, expect, it } from 'vitest'

describe('ShopImportModal', () => {
  it('can be imported', async () => {
    const mod = await import('./ShopImportModal')
    expect(mod).toBeDefined()
  })
})
