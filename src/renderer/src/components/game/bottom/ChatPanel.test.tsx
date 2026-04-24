import { describe, expect, it } from 'vitest'

describe('ChatPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./ChatPanel')
    expect(mod).toBeDefined()
  })
})
