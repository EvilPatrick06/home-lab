import { describe, expect, it } from 'vitest'

describe('GearTab5e', () => {
  it('can be imported', async () => {
    const mod = await import('./GearTab5e')
    expect(mod).toBeDefined()
  })
})
