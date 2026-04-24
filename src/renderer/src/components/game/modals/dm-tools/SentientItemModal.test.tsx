import { describe, expect, it } from 'vitest'

describe('SentientItemModal', () => {
  it('can be imported', async () => {
    const mod = await import('./SentientItemModal')
    expect(mod).toBeDefined()
  })
})
