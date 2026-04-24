import { describe, expect, it } from 'vitest'

describe('CraftingProgress5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CraftingProgress5e')
    expect(mod).toBeDefined()
  })
})
