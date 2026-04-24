import { describe, expect, it } from 'vitest'

describe('ReactionPrompts', () => {
  it('can be imported', async () => {
    const mod = await import('./ReactionPrompts')
    expect(mod).toBeDefined()
  })
})
