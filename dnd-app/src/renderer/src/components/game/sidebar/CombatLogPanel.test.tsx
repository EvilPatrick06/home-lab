import { describe, expect, it } from 'vitest'

describe('CombatLogPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./CombatLogPanel')
    expect(mod).toBeDefined()
  })
})
