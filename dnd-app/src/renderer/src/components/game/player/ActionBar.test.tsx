import { describe, expect, it } from 'vitest'

describe('ActionBar', () => {
  it('can be imported', async () => {
    const mod = await import('./ActionBar')
    expect(mod).toBeDefined()
  })
})
