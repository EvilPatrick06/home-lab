import { describe, expect, it } from 'vitest'

describe('FogBrush', () => {
  it('can be imported', async () => {
    const mod = await import('./FogBrush')
    expect(mod).toBeDefined()
  })
})
