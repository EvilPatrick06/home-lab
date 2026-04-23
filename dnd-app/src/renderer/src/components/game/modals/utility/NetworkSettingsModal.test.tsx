import { describe, expect, it } from 'vitest'

describe('NetworkSettingsModal', () => {
  it('can be imported', async () => {
    const mod = await import('./NetworkSettingsModal')
    expect(mod).toBeDefined()
  })
})
