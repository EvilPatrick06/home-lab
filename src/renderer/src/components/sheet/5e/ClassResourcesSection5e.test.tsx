import { describe, expect, it } from 'vitest'

describe('ClassResourcesSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./ClassResourcesSection5e')
    expect(mod).toBeDefined()
  })
})
