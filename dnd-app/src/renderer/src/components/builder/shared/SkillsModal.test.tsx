import { describe, expect, it } from 'vitest'

describe('SkillsModal', () => {
  it('can be imported', async () => {
    const mod = await import('./SkillsModal')
    expect(mod).toBeDefined()
  })
})
