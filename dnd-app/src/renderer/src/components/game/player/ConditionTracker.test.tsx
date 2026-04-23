import { describe, expect, it } from 'vitest'

describe('ConditionTracker', () => {
  it('can be imported', async () => {
    const mod = await import('./ConditionTracker')
    expect(mod).toBeDefined()
  })
})
