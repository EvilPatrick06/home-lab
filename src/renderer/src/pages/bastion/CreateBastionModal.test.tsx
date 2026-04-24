import { describe, expect, it } from 'vitest'

describe('CreateBastionModal', () => {
  it('can be imported', async () => {
    const mod = await import('./CreateBastionModal')
    expect(mod).toBeDefined()
  })
})
