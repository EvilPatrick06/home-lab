import { describe, expect, it } from 'vitest'

describe('SkillRollButton', () => {
  it('can be imported', async () => {
    const mod = await import('./SkillRollButton')
    expect(mod).toBeDefined()
  })
})
