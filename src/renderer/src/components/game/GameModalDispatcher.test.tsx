import { describe, expect, it } from 'vitest'

describe('GameModalDispatcher', () => {
  it('can be imported', async () => {
    const mod = await import('./GameModalDispatcher')
    expect(mod).toBeDefined()
  })
})
