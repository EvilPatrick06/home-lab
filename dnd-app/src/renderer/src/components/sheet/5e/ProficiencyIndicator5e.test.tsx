import { describe, expect, it } from 'vitest'

describe('ProficiencyIndicator5e', () => {
  it('can be imported', async () => {
    const mod = await import('./ProficiencyIndicator5e')
    expect(mod).toBeDefined()
  })
})
