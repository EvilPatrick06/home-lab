import { describe, expect, it } from 'vitest'

describe('BackstoryEditor5e', () => {
  it('can be imported', async () => {
    const mod = await import('./BackstoryEditor5e')
    expect(mod).toBeDefined()
  })
})
