import { describe, expect, it } from 'vitest'

describe('MagicItemsPanel5e', () => {
  it('can be imported', async () => {
    const mod = await import('./MagicItemsPanel5e')
    expect(mod).toBeDefined()
  })
})
