import { describe, expect, it, vi } from 'vitest'
import CampaignDetailPage from './CampaignDetailPage'

vi.mock('./campaign-detail/AdventureManager', () => ({ default: () => null }))
vi.mock('./campaign-detail/LoreManager', () => ({ default: () => null }))
vi.mock('./campaign-detail/NPCManager', () => ({ default: () => null }))
vi.mock('./campaign-detail/RuleManager', () => ({ default: () => null }))

describe('CampaignDetailPage', () => {
  it('can be imported', () => {
    expect(CampaignDetailPage).toBeDefined()
  })
})
