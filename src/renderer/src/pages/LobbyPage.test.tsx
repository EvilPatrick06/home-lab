import { describe, expect, it } from 'vitest'

describe('LobbyPage', () => {
  it('can be imported', async () => {
    const mod = await import('./LobbyPage')
    expect(mod).toBeDefined()
  })
})
