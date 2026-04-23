import { describe, expect, it } from 'vitest'

describe('UnifiedStatBlock', () => {
  it('can be imported', async () => {
    const mod = await import('./UnifiedStatBlock')
    expect(mod).toBeDefined()
  })
})
