import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/chat-commands', () => ({
  executeCommand: () => null,
  getFilteredCommands: () => []
}))

describe('PlayerBottomBar', () => {
  it('can be imported', async () => {
    const mod = await import('./PlayerBottomBar')
    expect(mod).toBeDefined()
  })
})
