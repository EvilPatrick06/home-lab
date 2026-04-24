import { describe, expect, it } from 'vitest'

describe('ViewModeToggle', () => {
  it('can be imported', async () => {
    const mod = await import('./ViewModeToggle')
    expect(mod).toBeDefined()
  })
})
