import { describe, expect, it } from 'vitest'

describe('HiddenDiceModal', () => {
  it('can be imported', async () => {
    const mod = await import('./HiddenDiceModal')
    expect(mod).toBeDefined()
  })
})
