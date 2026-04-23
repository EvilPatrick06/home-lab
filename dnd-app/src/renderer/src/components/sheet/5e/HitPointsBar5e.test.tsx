import { describe, expect, it } from 'vitest'

describe('HitPointsBar5e', () => {
  it('can be imported', async () => {
    const mod = await import('./HitPointsBar5e')
    expect(mod).toBeDefined()
  })
})
