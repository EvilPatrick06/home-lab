import { describe, expect, it } from 'vitest'

describe('CraftingSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CraftingSection5e')
    expect(mod).toBeDefined()
  })
})
