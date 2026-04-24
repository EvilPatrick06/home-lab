import { describe, expect, it } from 'vitest'

describe('TurnEventsTab', () => {
  it('can be imported', async () => {
    const mod = await import('./TurnEventsTab')
    expect(mod).toBeDefined()
  })
})
