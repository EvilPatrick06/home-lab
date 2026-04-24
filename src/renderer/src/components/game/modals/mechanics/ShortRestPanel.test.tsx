import { describe, expect, it } from 'vitest'

describe('ShortRestPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./ShortRestPanel')
    expect(mod).toBeDefined()
  })
})
