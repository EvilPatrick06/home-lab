import { describe, expect, it } from 'vitest'

describe('TreasureGeneratorModal', () => {
  it('can be imported', async () => {
    const mod = await import('./TreasureGeneratorModal')
    expect(mod).toBeDefined()
  })
})
