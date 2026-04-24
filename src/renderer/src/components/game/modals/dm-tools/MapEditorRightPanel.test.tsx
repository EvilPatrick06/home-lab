import { describe, expect, it } from 'vitest'

describe('MapEditorRightPanel', () => {
  it('can be imported', async () => {
    const mod = await import('./MapEditorRightPanel')
    expect(mod).toBeDefined()
  })
})
