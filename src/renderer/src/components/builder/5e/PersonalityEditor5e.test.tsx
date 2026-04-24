import { describe, expect, it } from 'vitest'

describe('PersonalityEditor5e', () => {
  it('can be imported', async () => {
    const mod = await import('./PersonalityEditor5e')
    expect(mod).toBeDefined()
  })
})
