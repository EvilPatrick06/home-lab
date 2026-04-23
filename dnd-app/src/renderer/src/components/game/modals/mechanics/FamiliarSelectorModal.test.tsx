import { describe, expect, it } from 'vitest'

describe('FamiliarSelectorModal', () => {
  it('can be imported', async () => {
    const mod = await import('./FamiliarSelectorModal')
    expect(mod).toBeDefined()
  })
})
