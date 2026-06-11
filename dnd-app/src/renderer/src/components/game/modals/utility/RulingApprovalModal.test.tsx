// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Stub the dynamic executor import the store's approvePendingActions uses (not exercised
// by these dismiss/override tests, but keeps the module graph self-contained).
vi.mock('../../../../services/game-action-executor', () => ({
  executeDmActions: vi.fn(() => ({ executed: [], failed: [] }))
}))

import { useAiDmStore } from '../../../../stores/use-ai-dm-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import RulingApprovalModal from './RulingApprovalModal'

const makeSet = (id: string) => ({
  id,
  text: id,
  actions: [{ action: 'move_token', label: 'Goblin' }],
  statChanges: []
})

describe('RulingApprovalModal', () => {
  afterEach(() => {
    useAiDmStore.setState({ pendingActionSets: [] })
    useLobbyStore.setState({ chatMessages: [] })
  })

  it('can be imported', async () => {
    const mod = await import('./RulingApprovalModal')
    expect(mod).toBeDefined()
  })

  it('Dismiss drops the head ruling and writes NO chat line (F5)', () => {
    useAiDmStore.setState({ pendingActionSets: [makeSet('a'), makeSet('b')] })
    render(<RulingApprovalModal />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(useAiDmStore.getState().pendingActionSets.map((s) => s.id)).toEqual(['b'])
    expect(useLobbyStore.getState().chatMessages).toHaveLength(0)
  })

  it('Override drops the head and logs a [DM Override] chat line', () => {
    useAiDmStore.setState({ pendingActionSets: [makeSet('a')] })
    render(<RulingApprovalModal />)
    fireEvent.click(screen.getByText('Override'))
    const msgs = useLobbyStore.getState().chatMessages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].content).toContain('[DM Override]')
    expect(useAiDmStore.getState().pendingActionSets).toHaveLength(0)
  })

  it('renders a queue-count note when more than one ruling is pending', () => {
    useAiDmStore.setState({ pendingActionSets: [makeSet('a'), makeSet('b')] })
    render(<RulingApprovalModal />)
    expect(screen.getByText(/2 rulings pending/)).toBeTruthy()
  })

  it('renders nothing when the queue is empty', () => {
    useAiDmStore.setState({ pendingActionSets: [] })
    const { container } = render(<RulingApprovalModal />)
    expect(container.firstChild).toBeNull()
  })
})
