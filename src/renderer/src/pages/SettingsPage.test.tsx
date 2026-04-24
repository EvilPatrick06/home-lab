import { describe, expect, it } from 'vitest'

describe('SettingsPage', () => {
  it('can be imported', async () => {
    const mod = await import('./SettingsPage')
    expect(mod).toBeDefined()
  })
})
