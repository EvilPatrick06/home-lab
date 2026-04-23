import { describe, expect, it } from 'vitest'

describe('LairActionPrompt', () => {
  it('can be imported', async () => {
    const mod = await import('./LairActionPrompt')
    expect(mod).toBeDefined()
  })
})
