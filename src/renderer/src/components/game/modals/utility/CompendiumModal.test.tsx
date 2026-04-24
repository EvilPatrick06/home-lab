import { describe, expect, it } from 'vitest'

describe('CompendiumModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CompendiumModal')
    expect(mod).toBeDefined()
  })
})
