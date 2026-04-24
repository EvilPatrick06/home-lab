import { describe, expect, it } from 'vitest'

describe('CraftingBrowser', () => {
  it('can be imported', async () => {
    const mod = await import('./CraftingBrowser')
    expect(mod).toBeDefined()
  })
})
