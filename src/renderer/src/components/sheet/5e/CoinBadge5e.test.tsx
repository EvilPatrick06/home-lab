import { describe, expect, it } from 'vitest'

describe('CoinBadge5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CoinBadge5e')
    expect(mod).toBeDefined()
  })
})
