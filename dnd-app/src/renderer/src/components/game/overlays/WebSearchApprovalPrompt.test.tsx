// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiDmStore } from '../../../stores/use-ai-dm-store'
import WebSearchApprovalPrompt from './WebSearchApprovalPrompt'

const approveWebSearch = vi.fn().mockResolvedValue({ success: true })

beforeEach(() => {
  approveWebSearch.mockClear().mockResolvedValue({ success: true })
  ;(window as unknown as { api: unknown }).api = { ai: { approveWebSearch } }
})

afterEach(() => {
  useAiDmStore.setState({ webSearchStatus: null, webSearchDecided: false })
})

const seedPending = (): void =>
  useAiDmStore.setState({
    webSearchStatus: {
      query: 'lich phylactery',
      status: 'pending_approval',
      streamId: 'sid-1',
      receivedAt: Date.now()
    },
    webSearchDecided: false
  })

describe('WebSearchApprovalPrompt', () => {
  it('can be imported', async () => {
    const mod = await import('./WebSearchApprovalPrompt')
    expect(mod.default).toBeDefined()
  })

  it('renders a dialog with a live auto-reject countdown', () => {
    seedPending()
    render(<WebSearchApprovalPrompt />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Auto-rejects in/)).toBeTruthy()
  })

  it('Escape rejects the request (approveWebSearch called with approved=false)', () => {
    seedPending()
    render(<WebSearchApprovalPrompt />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(approveWebSearch).toHaveBeenCalledWith('sid-1', false)
  })

  it('clears the status when the request is already stale (success:false)', async () => {
    approveWebSearch.mockResolvedValueOnce({ success: false, error: 'gone' })
    seedPending()
    render(<WebSearchApprovalPrompt />)
    fireEvent.click(screen.getByText('Reject'))
    await waitFor(() => expect(useAiDmStore.getState().webSearchStatus).toBeNull())
  })

  it('renders nothing when no request is pending', () => {
    useAiDmStore.setState({ webSearchStatus: null })
    const { container } = render(<WebSearchApprovalPrompt />)
    expect(container.firstChild).toBeNull()
  })
})
