import { describe, expect, it } from 'vitest'

describe('WebSearchApprovalPrompt', () => {
  it('can be imported', async () => {
    const mod = await import('./WebSearchApprovalPrompt')
    expect(mod.default).toBeDefined()
  })
})
