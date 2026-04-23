import { describe, expect, it } from 'vitest'

describe('EmptyCellContextMenu', () => {
  it('can be imported', async () => {
    const mod = await import('./EmptyCellContextMenu')
    expect(mod).toBeDefined()
  })
})
