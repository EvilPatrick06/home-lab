import { describe, expect, it } from 'vitest'

describe('SpellPicker5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellPicker5e')
    expect(mod).toBeDefined()
  })
})
