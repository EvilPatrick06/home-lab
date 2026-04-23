import { describe, expect, it } from 'vitest'

describe('AppearanceEditor5e', () => {
  it('can be imported', async () => {
    const mod = await import('./AppearanceEditor5e')
    expect(mod).toBeDefined()
  })
})
