import { describe, expect, it } from 'vitest'

describe('SpellReferenceModal', () => {
  it('can be imported', async () => {
    const mod = await import('./SpellReferenceModal')
    expect(mod).toBeDefined()
  })
})
