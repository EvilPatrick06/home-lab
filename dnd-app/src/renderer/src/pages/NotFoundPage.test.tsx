import { describe, expect, it } from 'vitest'

describe('NotFoundPage', () => {
  it('can be imported', async () => {
    const mod = await import('./NotFoundPage')
    expect(mod).toBeDefined()
  })
})
