import { describe, expect, it } from 'vitest'

describe('TurnNotificationBanner', () => {
  it('can be imported', async () => {
    const mod = await import('./TurnNotificationBanner')
    expect(mod).toBeDefined()
  })
})
