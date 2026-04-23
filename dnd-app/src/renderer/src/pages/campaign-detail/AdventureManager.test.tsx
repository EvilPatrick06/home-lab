import { describe, expect, it } from 'vitest'

describe('AdventureManager', () => {
  it('can be imported', async () => {
    const mod = await import('./AdventureManager')
    expect(mod).toBeDefined()
  })
})
