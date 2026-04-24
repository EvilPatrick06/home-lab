import { describe, expect, it } from 'vitest'

describe('AboutPage', () => {
  it('can be imported', async () => {
    const mod = await import('./AboutPage')
    expect(mod).toBeDefined()
  })
})
