import { describe, expect, it } from 'vitest'

describe('CraftingRecipeList5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CraftingRecipeList5e')
    expect(mod).toBeDefined()
  })
})
