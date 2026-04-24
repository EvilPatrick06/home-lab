import { describe, expect, it } from 'vitest'

describe('SessionZeroCard', () => {
  it('can be imported', async () => {
    const mod = await import('./SessionZeroCard')
    expect(mod).toBeDefined()
  })
})
