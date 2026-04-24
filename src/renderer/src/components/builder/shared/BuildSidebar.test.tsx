import { describe, expect, it } from 'vitest'

describe('BuildSidebar', () => {
  it('can be imported', async () => {
    const mod = await import('./BuildSidebar')
    expect(mod).toBeDefined()
  })
})
