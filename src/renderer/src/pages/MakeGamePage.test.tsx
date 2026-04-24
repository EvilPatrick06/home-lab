import { describe, expect, it } from 'vitest'

describe('MakeGamePage', () => {
  it('can be imported', async () => {
    const mod = await import('./MakeGamePage')
    expect(mod).toBeDefined()
  })
})
