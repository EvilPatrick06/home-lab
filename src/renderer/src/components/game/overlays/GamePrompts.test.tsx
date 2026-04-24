import { describe, expect, it } from 'vitest'

describe('GamePrompts', () => {
  it('can be imported', async () => {
    const mod = await import('./GamePrompts')
    expect(mod).toBeDefined()
  })
})
