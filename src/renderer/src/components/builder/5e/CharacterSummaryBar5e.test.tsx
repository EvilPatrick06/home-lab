import { describe, expect, it } from 'vitest'

describe('CharacterSummaryBar5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CharacterSummaryBar5e')
    expect(mod).toBeDefined()
  })
})
