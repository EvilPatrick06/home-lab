import { describe, expect, it } from 'vitest'

describe('NPCGeneratorModal', () => {
  it('can be imported', async () => {
    const mod = await import('./NPCGeneratorModal')
    expect(mod).toBeDefined()
  })
})
