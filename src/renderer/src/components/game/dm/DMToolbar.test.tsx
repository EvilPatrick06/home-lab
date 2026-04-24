import { describe, expect, it } from 'vitest'

describe('DMToolbar', () => {
  it('can be imported', async () => {
    const mod = await import('./DMToolbar')
    expect(mod).toBeDefined()
  })
})
