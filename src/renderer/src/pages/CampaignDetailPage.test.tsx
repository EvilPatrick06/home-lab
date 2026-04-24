import { describe, expect, it } from 'vitest'

describe('CampaignDetailPage', () => {
  it('can be imported', async () => {
    const mod = await import('./CampaignDetailPage')
    expect(mod).toBeDefined()
  })
})
