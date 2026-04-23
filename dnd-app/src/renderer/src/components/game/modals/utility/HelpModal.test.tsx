import { describe, expect, it } from 'vitest'

describe('HelpModal', () => {
  it('can be imported', async () => {
    const mod = await import('./HelpModal')
    expect(mod).toBeDefined()
  })
})
