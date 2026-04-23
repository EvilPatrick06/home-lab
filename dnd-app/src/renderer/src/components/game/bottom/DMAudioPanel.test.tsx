import { describe, expect, it } from 'vitest'

describe('DMAudioPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./DMAudioPanel')
    expect(mod).toBeDefined()
  })
})
