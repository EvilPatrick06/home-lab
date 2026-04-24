import { describe, expect, it } from 'vitest'

describe('PlayerBottomBar', () => {
  it('can be imported', async () => {
    const mod = await import('./PlayerBottomBar')
    expect(mod).toBeDefined()
  })
})
