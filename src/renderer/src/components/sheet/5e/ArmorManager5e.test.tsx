import { describe, expect, it } from 'vitest'

describe('ArmorManager5e', () => {
  it('can be imported', async () => {
    const mod = await import('./ArmorManager5e')
    expect(mod).toBeDefined()
  })
})
