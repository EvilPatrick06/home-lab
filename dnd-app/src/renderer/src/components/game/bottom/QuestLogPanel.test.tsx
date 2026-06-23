// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QuestLogPanel from './QuestLogPanel'

const getQuestLog = vi.fn()
const updateQuestObjective = vi.fn()
const advanceChapter = vi.fn()
const onQuestStateChanged = vi.fn(() => vi.fn())

const LOG = {
  version: 1,
  chapter: { number: 2, title: 'The Mines', goal: 'find the source', startedAt: '' },
  quests: [
    {
      id: 'main',
      name: 'Find the smith',
      description: 'd',
      status: 'active',
      chapterQuest: true,
      objectives: [
        { id: 'o1', text: 'Ask the tavern', status: 'completed' },
        { id: 'o2', text: 'Search the forge', status: 'pending' }
      ]
    }
  ]
}

beforeEach(() => {
  getQuestLog.mockResolvedValue({ success: true, data: LOG })
  updateQuestObjective.mockResolvedValue({ success: true, data: LOG })
  advanceChapter.mockResolvedValue({ success: true, data: LOG })
  ;(window as any).api = { ai: { getQuestLog, updateQuestObjective, advanceChapter, onQuestStateChanged } }
})
afterEach(() => {
  ;(window as any).api = undefined
  vi.clearAllMocks()
})

describe('QuestLogPanel (PHASE-28 28F)', () => {
  it('loads the quest log and renders chapter + quest + objectives', async () => {
    render(<QuestLogPanel campaignId="c1" />)
    await waitFor(() => expect(getQuestLog).toHaveBeenCalledWith('c1'))
    expect(screen.getByText(/Chapter 2: The Mines/)).toBeTruthy()
    expect(screen.getByText('Find the smith')).toBeTruthy()
    expect(screen.getByText('Search the forge')).toBeTruthy()
  })

  it('toggling a pending objective completes it via IPC', async () => {
    render(<QuestLogPanel campaignId="c1" />)
    await waitFor(() => expect(screen.getByText('Search the forge')).toBeTruthy())
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    // o1 completed (checked), o2 pending (unchecked) — toggle o2.
    const pending = boxes.find((b) => !b.checked) as HTMLInputElement
    fireEvent.click(pending)
    await waitFor(() =>
      expect(updateQuestObjective).toHaveBeenCalledWith('c1', {
        questName: 'Find the smith',
        operation: 'complete',
        objective: 'o2'
      })
    )
  })

  it('shows the advance banner only when a chapter advance is pending', async () => {
    render(<QuestLogPanel campaignId="c1" />)
    await waitFor(() => expect(getQuestLog).toHaveBeenCalled())
    expect(screen.queryByText(/Advance to Chapter/)).toBeNull()
  })

  it('renders the advance banner + advances on click when pending', async () => {
    getQuestLog.mockResolvedValue({
      success: true,
      data: { ...LOG, pendingChapterAdvance: { proposedAt: '', reason: 'Chapter quests complete: Find the smith' } }
    })
    render(<QuestLogPanel campaignId="c1" />)
    await waitFor(() => expect(screen.getByText(/Advance to Chapter 3/)).toBeTruthy())
    fireEvent.click(screen.getByText(/Advance to Chapter 3/))
    await waitFor(() => expect(advanceChapter).toHaveBeenCalledWith('c1', {}))
  })
})
