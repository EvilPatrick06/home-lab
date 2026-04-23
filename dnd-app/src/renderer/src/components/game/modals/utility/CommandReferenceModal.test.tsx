import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../../services/chat-commands', () => ({
  getCommands: () => []
}))

describe('CommandReferenceModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CommandReferenceModal')
    expect(mod).toBeDefined()
  })
})
