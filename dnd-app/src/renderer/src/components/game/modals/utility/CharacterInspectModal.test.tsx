import { describe, expect, it } from 'vitest'

describe('CharacterInspectModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CharacterInspectModal')
    expect(mod).toBeDefined()
  })
})
