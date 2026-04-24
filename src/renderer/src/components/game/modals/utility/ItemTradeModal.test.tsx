import { describe, expect, it } from 'vitest'

describe('ItemTradeModal', () => {
  it('can be imported', async () => {
    const mod = await import('./ItemTradeModal')
    expect(mod).toBeDefined()
  })
})
