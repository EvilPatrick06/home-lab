import { describe, expect, it, vi } from 'vitest'

vi.mock('./SidebarEntryList', () => ({ default: () => null }))
vi.mock('./TablesPanel', () => ({ default: () => null }))
vi.mock('../dm', () => ({ NPCManager: () => null }))
vi.mock('../../../pages/bastion/BastionList', () => ({ default: () => null }))
vi.mock('./CombatLogPanel', () => ({ default: () => null }))
vi.mock('./JournalPanel', () => ({ default: () => null }))

describe('LeftSidebar', () => {
  it('can be imported', async () => {
    const mod = await import('./LeftSidebar')
    expect(mod).toBeDefined()
  })
})
