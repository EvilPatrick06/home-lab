import { describe, expect, it } from 'vitest'

describe('PrintSheetHeader', () => {
  it('can be imported', async () => {
    const mod = await import('./PrintSheetHeader')
    expect(mod).toBeDefined()
  })
})
