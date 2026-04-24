import { describe, expect, it } from 'vitest'

describe('CustomEffectModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CustomEffectModal')
    expect(mod).toBeDefined()
  })
})
