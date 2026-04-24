import { describe, expect, it } from 'vitest'

describe('LeftSidebar', () => {
  it('can be imported', async () => {
    const mod = await import('./LeftSidebar')
    expect(mod).toBeDefined()
  })
})
