import { describe, expect, it } from 'vitest'

describe('AbilityScoresGrid5e', () => {
  it('can be imported', async () => {
    const mod = await import('./AbilityScoresGrid5e')
    expect(mod).toBeDefined()
  })
})
