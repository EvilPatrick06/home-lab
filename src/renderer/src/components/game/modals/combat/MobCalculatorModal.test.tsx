import { describe, expect, it } from 'vitest'

describe('MobCalculatorModal', () => {
  it('can be imported', async () => {
    const mod = await import('./MobCalculatorModal')
    expect(mod).toBeDefined()
  })
})
