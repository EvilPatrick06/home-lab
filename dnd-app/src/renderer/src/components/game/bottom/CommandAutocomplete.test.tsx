import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/chat-commands', () => ({
  getFilteredCommands: () => []
}))

describe('CommandAutocomplete', () => {
  it('can be imported', async () => {
    const mod = await import('./CommandAutocomplete')
    expect(mod).toBeDefined()
  })
})
