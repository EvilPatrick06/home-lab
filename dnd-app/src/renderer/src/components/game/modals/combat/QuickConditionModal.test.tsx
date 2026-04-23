import { describe, expect, it } from 'vitest'

describe('QuickConditionModal', () => {
  it('can be imported', async () => {
    const mod = await import('./QuickConditionModal')
    expect(mod).toBeDefined()
  })
})
