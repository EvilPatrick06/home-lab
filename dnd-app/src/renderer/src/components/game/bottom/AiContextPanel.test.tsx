import { describe, expect, it } from 'vitest'

describe('AiContextPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./AiContextPanel')
    expect(mod).toBeDefined()
  })
})
