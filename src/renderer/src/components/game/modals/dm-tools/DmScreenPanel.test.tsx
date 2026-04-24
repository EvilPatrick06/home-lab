import { describe, expect, it } from 'vitest'

describe('DmScreenPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./DmScreenPanel')
    expect(mod).toBeDefined()
  })
})
