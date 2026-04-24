import { describe, expect, it } from 'vitest'

describe('RuleManager', () => {
  it('can be imported', async () => {
    const mod = await import('./RuleManager')
    expect(mod).toBeDefined()
  })
})
