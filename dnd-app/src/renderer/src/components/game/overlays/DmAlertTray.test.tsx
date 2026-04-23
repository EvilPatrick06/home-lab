import { describe, expect, it } from 'vitest'

describe('DmAlertTray', () => {
  it('can be imported', async () => {
    const mod = await import('./DmAlertTray')
    expect(mod).toBeDefined()
  })
})
