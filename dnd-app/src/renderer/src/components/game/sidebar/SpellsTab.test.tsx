import { describe, expect, it } from 'vitest'

describe('SpellsTab', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellsTab')
    expect(mod).toBeDefined()
  })
})
