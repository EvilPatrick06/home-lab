import { describe, expect, it } from 'vitest'

describe('MoonOverridePanel', () => {
  it('can be imported', async () => {
    const mod = await import('./MoonOverridePanel')
    expect(mod).toBeDefined()
  })
})
