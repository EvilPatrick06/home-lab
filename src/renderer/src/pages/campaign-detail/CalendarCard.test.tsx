import { describe, expect, it } from 'vitest'

describe('CalendarCard', () => {
  it('can be imported', async () => {
    const mod = await import('./CalendarCard')
    expect(mod).toBeDefined()
  })
})
