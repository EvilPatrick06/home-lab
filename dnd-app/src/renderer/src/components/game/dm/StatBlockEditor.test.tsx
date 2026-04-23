import { describe, expect, it } from 'vitest'

describe('StatBlockEditor', () => {
  it('can be imported', async () => {
    const mod = await import('./StatBlockEditor')
    expect(mod).toBeDefined()
  })
})
