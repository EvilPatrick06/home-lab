import { describe, expect, it } from 'vitest'

describe('init', () => {
  it('can be imported', async () => {
    const mod = await import('./init')
    expect(mod).toBeDefined()
  })
})
