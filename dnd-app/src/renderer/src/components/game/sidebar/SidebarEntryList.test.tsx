import { describe, expect, it } from 'vitest'

describe('SidebarEntryList', () => {
  it('can be imported', async () => {
    const mod = await import('./SidebarEntryList')
    expect(mod).toBeDefined()
  })
})
