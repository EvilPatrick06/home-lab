import { describe, expect, it } from 'vitest'

describe('JoinGamePage', () => {
  it('can be imported', async () => {
    const mod = await import('./JoinGamePage')
    expect(mod).toBeDefined()
  })
})
