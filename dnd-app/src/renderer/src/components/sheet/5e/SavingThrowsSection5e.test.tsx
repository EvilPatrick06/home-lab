import { describe, expect, it } from 'vitest'

describe('SavingThrowsSection5e', () => {
  it('can be imported', async () => {
    const mod = await import('./SavingThrowsSection5e')
    expect(mod).toBeDefined()
  })
})
