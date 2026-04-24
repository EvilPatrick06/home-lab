import { describe, expect, it } from 'vitest'

describe('AsiModal', () => {
  it('can be imported', async () => {
    const mod = await import('./AsiModal')
    expect(mod).toBeDefined()
  })
})
