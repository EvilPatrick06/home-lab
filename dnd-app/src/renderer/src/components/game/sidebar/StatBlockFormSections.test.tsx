import { describe, expect, it } from 'vitest'

describe('StatBlockFormSections', () => {
  it('can be imported', async () => {
    const mod = await import('./StatBlockFormSections')
    expect(mod).toBeDefined()
  })
})
