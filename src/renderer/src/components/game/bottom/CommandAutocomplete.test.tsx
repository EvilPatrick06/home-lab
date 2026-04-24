import { describe, expect, it } from 'vitest'

describe('CommandAutocomplete', () => {
  it('can be imported', async () => {
    const mod = await import('./CommandAutocomplete')
    expect(mod).toBeDefined()
  })
})
