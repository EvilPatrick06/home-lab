import { describe, expect, it } from 'vitest'

describe('MagicItemCard5e', () => {
  it('can be imported', async () => {
    const mod = await import('./MagicItemCard5e')
    expect(mod).toBeDefined()
  })
})
