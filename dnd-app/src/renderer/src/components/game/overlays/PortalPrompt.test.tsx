import { describe, expect, it } from 'vitest'

describe('PortalPrompt', () => {
  it('can be imported', async () => {
    const mod = await import('./PortalPrompt')
    expect(mod).toBeDefined()
  })
})
