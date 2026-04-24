import { describe, expect, it } from 'vitest'

describe('CalendarPage', () => {
  it('can be imported', async () => {
    const mod = await import('./CalendarPage')
    expect(mod).toBeDefined()
  })
})
