import { describe, expect, it, vi } from 'vitest'

vi.mock('./ContentTabs5e', () => ({ default: () => null }))
vi.mock('./DetailsTab5e', () => ({ default: () => null }))
vi.mock('./LanguagesTab5e', () => ({ default: () => null }))
vi.mock('./SpecialAbilitiesTab5e', () => ({ default: () => null }))
vi.mock('./SpellsTab5e', () => ({ default: () => null }))
vi.mock('./GearTab5e', () => ({ default: () => null }))
vi.mock('../shared/AbilityScoreModal', () => ({ default: () => null }))
vi.mock('../shared/AsiModal', () => ({ default: () => null }))
vi.mock('../shared/ExpertiseModal', () => ({ default: () => null }))
vi.mock('../shared/SelectionModal', () => ({ default: () => null }))
vi.mock('../shared/SkillsModal', () => ({ default: () => null }))

describe('MainContentArea5e', () => {
  it('can be imported', async () => {
    const mod = await import('./MainContentArea5e')
    expect(mod).toBeDefined()
  })
})
