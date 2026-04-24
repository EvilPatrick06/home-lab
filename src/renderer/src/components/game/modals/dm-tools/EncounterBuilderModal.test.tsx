import { describe, expect, it } from 'vitest'

describe('EncounterBuilderModal', () => {
  it('can be imported', async () => {
    const mod = await import('./EncounterBuilderModal')
    expect(mod).toBeDefined()
  })
})
