import { describe, expect, it } from 'vitest'

describe('ThemeSelector', () => {
  it('can be imported', async () => {
    const mod = await import('./ThemeSelector')
    expect(mod).toBeDefined()
  })
})
