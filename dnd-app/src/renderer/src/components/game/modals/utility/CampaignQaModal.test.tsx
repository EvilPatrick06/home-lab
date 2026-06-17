// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCampaignStore } from '../../../../stores/use-campaign-store'
import CampaignQaModal from './CampaignQaModal'

const CAMPAIGN = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Test',
  aiDm: { enabled: true },
  journal: { entries: [] }
}
const REFUSAL = 'Not recorded in the campaign log.'

const history = vi.fn(async () => ({
  success: true,
  data: [] as Array<{ id: string; question: string; answer: string; timestamp: string }>
}))
const ask = vi.fn(async () => ({ success: true, data: { answer: 'The duke per the JOURNAL.', askedAt: 't' } }))
const clear = vi.fn(async () => ({ success: true }))

beforeEach(() => {
  history.mockClear()
  ask.mockClear()
  clear.mockClear()
  // @ts-expect-error — test stub of the preload bridge
  window.api = { ai: { campaignQaHistory: history, campaignQaAsk: ask, campaignQaClear: clear } }
  useCampaignStore.setState({ campaigns: [CAMPAIGN] as never, activeCampaignId: CAMPAIGN.id } as never)
})
afterEach(() => useCampaignStore.setState({ campaigns: [], activeCampaignId: null } as never))

describe('CampaignQaModal (PHASE-31 31D)', () => {
  it('loads history on open', async () => {
    render(<CampaignQaModal open={true} onClose={() => {}} />)
    await waitFor(() => expect(history).toHaveBeenCalledWith(CAMPAIGN.id))
  })

  it('asks a question and refreshes the history', async () => {
    history.mockResolvedValueOnce({ success: true, data: [] }).mockResolvedValueOnce({
      success: true,
      data: [{ id: 'q1', question: 'Who is the duke?', answer: 'The duke per the JOURNAL.', timestamp: 't' }]
    })
    render(<CampaignQaModal open={true} onClose={() => {}} />)
    const box = await screen.findByPlaceholderText(/innkeeper/i)
    fireEvent.change(box, { target: { value: 'Who is the duke?' } })
    fireEvent.click(screen.getByText('Ask'))
    await waitFor(() => expect(ask).toHaveBeenCalledWith(CAMPAIGN.id, 'Who is the duke?'))
    expect(await screen.findByText('The duke per the JOURNAL.')).toBeTruthy()
  })

  it('renders the refusal sentence in a muted/italic style', async () => {
    history.mockResolvedValue({
      success: true,
      data: [{ id: 'q1', question: 'unknown?', answer: REFUSAL, timestamp: 't' }]
    })
    render(<CampaignQaModal open={true} onClose={() => {}} />)
    const node = await screen.findByText(REFUSAL)
    expect(node.className).toMatch(/italic/)
  })

  it('Clear history calls campaignQaClear and empties the list', async () => {
    history.mockResolvedValue({ success: true, data: [{ id: 'q1', question: 'q', answer: 'a', timestamp: 't' }] })
    render(<CampaignQaModal open={true} onClose={() => {}} />)
    await screen.findByText('a')
    fireEvent.click(screen.getByText('Clear history'))
    await waitFor(() => expect(clear).toHaveBeenCalledWith(CAMPAIGN.id))
  })
})
