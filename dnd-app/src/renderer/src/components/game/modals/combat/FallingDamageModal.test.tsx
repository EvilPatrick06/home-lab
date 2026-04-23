import { describe, expect, it } from 'vitest'

describe('FallingDamageModal', () => {
  it('can be imported', async () => {
    const mod = await import('./FallingDamageModal')
    expect(mod).toBeDefined()
  })
})
