import { describe, expect, it } from 'vitest'

describe('MagicItemTrackerModal', () => {
  it('can be imported', async () => {
    const mod = await import('./MagicItemTrackerModal')
    expect(mod).toBeDefined()
  })
})
