import { describe, expect, it } from 'vitest'

describe('AttunementTracker5e', () => {
  it('can be imported', async () => {
    const mod = await import('./AttunementTracker5e')
    expect(mod).toBeDefined()
  })
})
