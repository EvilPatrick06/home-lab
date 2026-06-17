// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCampaignStore } from '../../../../stores/use-campaign-store'
import SessionStartRecapModal from './SessionStartRecapModal'

const CAMPAIGN = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  aiDm: { enabled: true },
  journal: { entries: [] }
}

const genRecap = vi.fn(async () => ({
  success: true,
  data: { text: 'The party stands at the gate.', generatedAt: '2026-06-17T00:00:00Z', cached: true }
}))
const saveCampaign = vi.fn(async (_campaign: unknown) => {})

beforeEach(() => {
  genRecap.mockClear()
  saveCampaign.mockClear()
  // @ts-expect-error — test stub of the preload bridge
  window.api = { ai: { generateSessionStartRecap: genRecap } }
  useCampaignStore.setState({ campaigns: [CAMPAIGN] as never, activeCampaignId: CAMPAIGN.id, saveCampaign } as never)
})
afterEach(() => useCampaignStore.setState({ campaigns: [], activeCampaignId: null } as never))

describe('SessionStartRecapModal (PHASE-31 31D)', () => {
  it('generates (cached) on open and shows the recap text', async () => {
    render(<SessionStartRecapModal open={true} onClose={() => {}} />)
    expect(await screen.findByDisplayValue('The party stands at the gate.')).toBeTruthy()
    expect(genRecap).toHaveBeenCalledWith(CAMPAIGN.id, false)
  })

  it('Regenerate forces a fresh recap (force=true)', async () => {
    render(<SessionStartRecapModal open={true} onClose={() => {}} />)
    await screen.findByDisplayValue('The party stands at the gate.')
    fireEvent.click(screen.getByText('Regenerate'))
    await waitFor(() => expect(genRecap).toHaveBeenCalledWith(CAMPAIGN.id, true))
  })

  it('Save to Journal persists an entry without starting a new session', async () => {
    render(<SessionStartRecapModal open={true} onClose={() => {}} />)
    await screen.findByDisplayValue('The party stands at the gate.')
    fireEvent.click(screen.getByText('Save to Journal'))
    await waitFor(() => expect(saveCampaign).toHaveBeenCalled())
    const saved = saveCampaign.mock.calls[0][0] as unknown as { journal: { entries: Array<{ authorId: string }> } }
    expect(saved.journal.entries[0].authorId).toBe('ai-dm')
  })
})
