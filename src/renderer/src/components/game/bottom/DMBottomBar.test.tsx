import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/chat-commands', () => ({
  executeCommand: () => null,
  getFilteredCommands: () => []
}))

describe('DMBottomBar', () => {
  it('can be imported', async () => {
    const mod = await import('./DMBottomBar')
    expect(mod).toBeDefined()
  })
})
