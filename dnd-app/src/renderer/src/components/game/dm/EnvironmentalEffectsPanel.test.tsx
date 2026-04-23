import { describe, expect, it } from 'vitest'

describe('EnvironmentalEffectsPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./EnvironmentalEffectsPanel')
    expect(mod).toBeDefined()
  })
})
