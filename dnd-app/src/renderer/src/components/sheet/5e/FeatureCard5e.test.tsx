import { describe, expect, it } from 'vitest'

describe('FeatureCard5e', () => {
  it('can be imported', async () => {
    const mod = await import('./FeatureCard5e')
    expect(mod).toBeDefined()
  })
})
