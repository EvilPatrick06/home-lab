import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/lobby', () => ({
  LobbyLayout: () => null
}))
vi.mock('./lobby/use-lobby-bridges', () => ({
  useLobbyBridges: () => undefined
}))

describe('LobbyPage', () => {
  it('can be imported', async () => {
    const mod = await import('./LobbyPage')
    expect(mod).toBeDefined()
  })
})
