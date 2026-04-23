import { describe, expect, it } from 'vitest'

describe('BackgroundPanel5e', () => {
  it('can be imported', async () => {
    const mod = await import('./BackgroundPanel5e')
    expect(mod).toBeDefined()
  })
})
