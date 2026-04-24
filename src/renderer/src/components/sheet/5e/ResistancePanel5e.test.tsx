import { describe, expect, it } from 'vitest'

describe('ResistancePanel5e', () => {
  it('can be imported', async () => {
    const mod = await import('./ResistancePanel5e')
    expect(mod).toBeDefined()
  })
})
