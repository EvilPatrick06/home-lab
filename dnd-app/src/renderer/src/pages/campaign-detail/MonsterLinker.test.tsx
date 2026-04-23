import { describe, expect, it } from 'vitest'

describe('MonsterLinker', () => {
  it('can be imported', async () => {
    const mod = await import('./MonsterLinker')
    expect(mod).toBeDefined()
  })
})
