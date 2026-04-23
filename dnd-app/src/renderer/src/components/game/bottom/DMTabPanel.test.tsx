import { describe, expect, it } from 'vitest'

describe('DMTabPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./DMTabPanel')
    expect(mod).toBeDefined()
  })
})
