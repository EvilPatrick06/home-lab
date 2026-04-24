import { describe, expect, it } from 'vitest'

describe('PrintSheet', () => {
  it('can be imported', async () => {
    const mod = await import('./PrintSheet')
    expect(mod).toBeDefined()
  })
})
