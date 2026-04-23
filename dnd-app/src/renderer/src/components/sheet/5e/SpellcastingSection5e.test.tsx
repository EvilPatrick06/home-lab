import { describe, expect, it } from 'vitest'

describe('SpellcastingSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellcastingSection5e')
    expect(mod).toBeDefined()
  })
})
