import { describe, expect, it } from 'vitest'

describe('DisputeModal', () => {
  it('can be imported', async () => {
    const mod = await import('./DisputeModal')
    expect(mod).toBeDefined()
  })
})
