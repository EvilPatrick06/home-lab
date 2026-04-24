import { describe, expect, it } from 'vitest'

describe('BuildLevelGroup', () => {
  it('can be imported', async () => {
    const mod = await import('./BuildLevelGroup')
    expect(mod).toBeDefined()
  })
})
