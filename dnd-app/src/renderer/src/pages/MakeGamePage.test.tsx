import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/campaign', () => ({
  CampaignWizard: () => null
}))

describe('MakeGamePage', () => {
  it('can be imported', async () => {
    const mod = await import('./MakeGamePage')
    expect(mod).toBeDefined()
  })
})
