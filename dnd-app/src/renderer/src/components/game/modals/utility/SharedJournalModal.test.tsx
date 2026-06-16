// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../../../../stores/use-game-store'
import type { SharedJournalEntry } from '../../../../types/game-state'
import SharedJournalModal from './SharedJournalModal'

// PHASE-13 13H — a journal-linked map pin opens the journal scrolled to + highlighting the entry.

const scrollIntoView = vi.fn()

const entry = (id: string, title: string): SharedJournalEntry => ({
  id,
  title,
  content: `${title} body`,
  authorPeerId: 'dm',
  authorName: 'DM',
  visibility: 'public',
  createdAt: 0,
  updatedAt: 0
})

beforeEach(() => {
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  useGameStore.setState({ sharedJournal: [entry('e1', 'First Entry'), entry('e2', 'Second Entry')] } as never)
})

afterEach(() => {
  useGameStore.setState({ sharedJournal: [] } as never)
  vi.clearAllMocks()
})

describe('SharedJournalModal deep-link (PHASE-13 13H)', () => {
  it('scrolls to + highlights the initialEntryId entry', async () => {
    const { container } = render(
      <SharedJournalModal isDM playerName="DM" localPeerId="dm" onClose={vi.fn()} initialEntryId="e2" />
    )

    await waitFor(() => expect(container.querySelector('.ring-amber-400')).toBeTruthy())
    const ring = container.querySelector('.ring-amber-400') as HTMLElement
    expect(ring.textContent).toContain('Second Entry')
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('does not highlight anything when no initialEntryId is given', () => {
    const { container } = render(<SharedJournalModal isDM playerName="DM" localPeerId="dm" onClose={vi.fn()} />)
    expect(screen.getByText('First Entry')).toBeTruthy()
    expect(container.querySelector('.ring-amber-400')).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
