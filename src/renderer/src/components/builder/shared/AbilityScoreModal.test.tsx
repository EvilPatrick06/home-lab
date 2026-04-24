import { describe, expect, it } from 'vitest'

describe('AbilityScoreModal', () => {
  it('can be imported', async () => {
    const mod = await import('./AbilityScoreModal')
    expect(mod).toBeDefined()
  })
})
