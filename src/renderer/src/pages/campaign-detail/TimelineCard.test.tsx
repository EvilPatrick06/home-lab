import { describe, expect, it } from 'vitest'

describe('TimelineCard', () => {
  it('can be imported', async () => {
    const mod = await import('./TimelineCard')
    expect(mod).toBeDefined()
  })
})
