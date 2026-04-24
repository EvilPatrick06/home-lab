import { describe, expect, it } from 'vitest'

describe('ResizeHandle', () => {
  it('can be imported', async () => {
    const mod = await import('./ResizeHandle')
    expect(mod).toBeDefined()
  })
})
