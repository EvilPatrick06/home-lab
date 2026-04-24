import { describe, expect, it } from 'vitest'

describe('DamageResultStep', () => {
  it('can be imported', async () => {
    const mod = await import('./DamageResultStep')
    expect(mod).toBeDefined()
  })
})
