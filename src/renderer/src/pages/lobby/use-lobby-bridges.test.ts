import { describe, expect, it } from 'vitest'

describe('use-lobby-bridges', () => {
  it('can be imported', async () => {
    const mod = await import('./use-lobby-bridges')
    expect(mod).toBeDefined()
  })
})
