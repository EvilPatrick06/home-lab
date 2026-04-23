import { describe, expect, it } from 'vitest'

describe('AiDmCard', () => {
  it('can be imported', async () => {
    const mod = await import('./AiDmCard')
    expect(mod).toBeDefined()
  })
})
