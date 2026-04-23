import { describe, expect, it } from 'vitest'

describe('MainMenuPage', () => {
  it('can be imported', async () => {
    const mod = await import('./MainMenuPage')
    expect(mod).toBeDefined()
  })
})
