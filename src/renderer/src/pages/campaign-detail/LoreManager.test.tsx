import { describe, expect, it } from 'vitest'

describe('LoreManager', () => {
  it('can be imported', async () => {
    const mod = await import('./LoreManager')
    expect(mod).toBeDefined()
  })
})
