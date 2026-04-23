import { describe, expect, it } from 'vitest'

describe('ActionEconomyBar', () => {
  it('can be imported', async () => {
    const mod = await import('./ActionEconomyBar')
    expect(mod).toBeDefined()
  })
})
