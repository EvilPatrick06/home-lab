import { describe, expect, it } from 'vitest'

describe('InGameCalendarModal', () => {
  it('can be imported', async () => {
    const mod = await import('./InGameCalendarModal')
    expect(mod).toBeDefined()
  })
})
