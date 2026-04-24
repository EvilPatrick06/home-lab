import { describe, expect, it } from 'vitest'

describe('ToolProficiencies5e', () => {
  it('can be imported', async () => {
    const mod = await import('./ToolProficiencies5e')
    expect(mod).toBeDefined()
  })
})
