import { describe, expect, it } from 'vitest'

describe('SettingsDropdown', () => {
  it('can be imported', async () => {
    const mod = await import('./SettingsDropdown')
    expect(mod).toBeDefined()
  })
})
