import { describe, expect, it } from 'vitest'

describe('PrintSheetSpells', () => {
  it('can be imported', async () => {
    const mod = await import('./PrintSheetSpells')
    expect(mod).toBeDefined()
  })
})
