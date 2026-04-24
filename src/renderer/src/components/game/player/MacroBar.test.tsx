import { describe, expect, it } from 'vitest'

describe('MacroBar', () => {
  it('can be imported', async () => {
    const mod = await import('./MacroBar')
    expect(mod).toBeDefined()
  })
})
