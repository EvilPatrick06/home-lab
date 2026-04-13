import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/chat-commands', () => ({
  executeCommand: () => null
}))

describe('ChatPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./ChatPanel')
    expect(mod).toBeDefined()
  })
})
