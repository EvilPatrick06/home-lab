import { describe, expect, it } from 'vitest'

describe('CombatStatsBar5e', () => {
  it('can be imported', async () => {
    const mod = await import('./CombatStatsBar5e')
    expect(mod).toBeDefined()
  })
})
