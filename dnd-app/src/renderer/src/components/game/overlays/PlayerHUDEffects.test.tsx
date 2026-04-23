import { describe, expect, it } from 'vitest'

describe('PlayerHUDEffects', () => {
  it('can be imported', async () => {
    const mod = await import('./PlayerHUDEffects')
    expect(mod).toBeDefined()
  })
})
