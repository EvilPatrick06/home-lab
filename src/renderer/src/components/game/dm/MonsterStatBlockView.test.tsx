import { describe, expect, it } from 'vitest'

describe('MonsterStatBlockView', () => {
  it('can be imported', async () => {
    const mod = await import('./MonsterStatBlockView')
    expect(mod).toBeDefined()
  })
})
