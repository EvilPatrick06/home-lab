// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../stores/use-character-store', () => ({
  useCharacterStore: (sel: (s: { characters: Array<{ id: string; name: string }> }) => unknown) =>
    sel({ characters: [{ id: 'ch1', name: 'Aragorn' }] })
}))

import { usePbpStore } from '../../../stores/use-pbp-store'
import type { Campaign } from '../../../types/campaign'
import PlayByPostSection from './PlayByPostSection'

const campaign = {
  id: 'c1',
  players: [
    { userId: 'u1', displayName: 'Alice', characterId: 'ch1', joinedAt: '', isActive: true, isReady: true },
    { userId: 'u2', displayName: 'Bob', characterId: null, joinedAt: '', isActive: true, isReady: true }
  ]
} as unknown as Campaign

type ApiFn = (p?: Record<string, unknown>) => Promise<Record<string, unknown>>
const api = {
  bmoPbpStatus: vi.fn<ApiFn>(async () => ({ ok: true, session: null })),
  bmoPbpStart: vi.fn<ApiFn>(async () => ({ ok: true, session: null })),
  bmoPbpAdvance: vi.fn<ApiFn>(async () => ({ ok: true })),
  bmoPbpSkip: vi.fn<ApiFn>(async () => ({ ok: true })),
  bmoPbpStop: vi.fn<ApiFn>(async () => ({ ok: true }))
}

const ACTIVE = {
  active: true,
  scene: 'Ambush',
  participants: [
    { name: 'Alice', character: 'Aragorn', discord_user_id: '111' },
    { name: 'Bob', character: null, discord_user_id: null }
  ],
  turn_index: 1,
  round: 2,
  reminder_hours: 24,
  auto_skip: false
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  usePbpStore.setState({ autoAdvance: false, lastStatus: null })
  api.bmoPbpStatus.mockResolvedValue({ ok: true, session: null })
  // @ts-expect-error — test stub of the preload bridge
  window.api = api
})

describe('PlayByPostSection (PHASE-36 36E)', () => {
  it('idle: expands and shows participants seeded from the roster', async () => {
    render(<PlayByPostSection campaign={campaign} />)
    fireEvent.click(screen.getByText(/Play-by-post/))
    await waitFor(() => expect(api.bmoPbpStatus).toHaveBeenCalled())
    expect(screen.getByText(/Alice \(Aragorn\)/)).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('Start passes the participants + cadence to bmoPbpStart', async () => {
    render(<PlayByPostSection campaign={campaign} />)
    fireEvent.click(screen.getByText(/Play-by-post/))
    await waitFor(() => expect(api.bmoPbpStatus).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Start play-by-post'))
    await waitFor(() => expect(api.bmoPbpStart).toHaveBeenCalled())
    const arg = api.bmoPbpStart.mock.calls[0][0] as {
      campaignId: string
      participants: unknown[]
      reminderHours: number
    }
    expect(arg.campaignId).toBe('c1')
    expect(arg.participants).toHaveLength(2)
    expect(arg.reminderHours).toBe(24)
  })

  it('renders the channel-not-found error on a failed start', async () => {
    api.bmoPbpStart.mockResolvedValue({ ok: false, error: 'channel_not_found' } as never)
    render(<PlayByPostSection campaign={campaign} />)
    fireEvent.click(screen.getByText(/Play-by-post/))
    await waitFor(() => expect(api.bmoPbpStatus).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Start play-by-post'))
    expect(await screen.findByText(/No Discord channel found/)).toBeTruthy()
  })

  it('active: renders the queue with current marker + claim markers + unclaimed hint', async () => {
    api.bmoPbpStatus.mockResolvedValue({ ok: true, session: ACTIVE })
    render(<PlayByPostSection campaign={campaign} />)
    fireEvent.click(screen.getByText(/Play-by-post/))
    await waitFor(() => expect(screen.getByText(/▶/)).toBeTruthy())
    expect(screen.getByText(/✅ Aragorn/)).toBeTruthy()
    expect(screen.getByText(/⬜ Bob/)).toBeTruthy()
    expect(screen.getByText(/won't be pinged/)).toBeTruthy()
  })

  it('End turn passes the expectedTurnIndex; Stop calls bmoPbpStop', async () => {
    api.bmoPbpStatus.mockResolvedValue({ ok: true, session: ACTIVE })
    render(<PlayByPostSection campaign={campaign} />)
    fireEvent.click(screen.getByText(/Play-by-post/))
    await waitFor(() => expect(screen.getByText('End turn')).toBeTruthy())
    fireEvent.click(screen.getByText('End turn'))
    await waitFor(() =>
      expect(api.bmoPbpAdvance).toHaveBeenCalledWith(expect.objectContaining({ expectedTurnIndex: 1 }))
    )
    fireEvent.click(screen.getByText('Stop'))
    await waitFor(() => expect(api.bmoPbpStop).toHaveBeenCalled())
  })
})
