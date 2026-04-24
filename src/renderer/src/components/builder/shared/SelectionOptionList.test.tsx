import { describe, expect, it } from 'vitest'

describe('SelectionOptionList', () => {
  it('can be imported', async () => {
    const mod = await import('./SelectionOptionList')
    expect(mod).toBeDefined()
  })
})
