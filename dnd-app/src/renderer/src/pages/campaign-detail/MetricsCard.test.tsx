import { describe, expect, it } from 'vitest'

describe('MetricsCard', () => {
  it('can be imported', async () => {
    const mod = await import('./MetricsCard')
    expect(mod).toBeDefined()
  })
})
