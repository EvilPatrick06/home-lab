import { describe, expect, it } from 'vitest'

describe('GridSettingsModal', () => {
  it('can be imported', async () => {
    const mod = await import('./GridSettingsModal')
    expect(mod).toBeDefined()
  })
})
