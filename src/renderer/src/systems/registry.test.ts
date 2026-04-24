import { describe, expect, it } from 'vitest'

describe('registry', () => {
  it('can be imported', async () => {
    const mod = await import('./registry')
    expect(mod).toBeDefined()
  })
})
