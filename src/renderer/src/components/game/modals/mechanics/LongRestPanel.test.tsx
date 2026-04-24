import { describe, expect, it } from 'vitest'

describe('LongRestPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./LongRestPanel')
    expect(mod).toBeDefined()
  })
})
