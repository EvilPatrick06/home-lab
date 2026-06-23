// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ContextInspectorPanel from './ContextInspectorPanel'

// PHASE-14 14E — context inspector snapshot rendering + preview fallback.

const getContextInspector = vi.fn()
const previewTokenBudget = vi.fn()

const BREAKDOWN = {
  rulebookChunks: 10,
  srdData: 20,
  characterData: 30,
  campaignData: 5,
  campaignDocs: 7,
  creatures: 15,
  gameState: 8,
  memory: 12,
  total: 100
}

beforeEach(() => {
  getContextInspector.mockReset()
  previewTokenBudget.mockReset()
  ;(window as any).api = { ai: { getContextInspector, previewTokenBudget } }
})

afterEach(() => vi.clearAllMocks())

// Expand the (initially collapsed) panel by clicking its toggle button.
const expand = (): void => {
  fireEvent.click(screen.getAllByRole('button')[0])
}

describe('ContextInspectorPanel (PHASE-14 14E)', () => {
  it('renders the section rows + window/estimate from a live snapshot (no preview note)', async () => {
    getContextInspector.mockResolvedValue({
      breakdown: BREAKDOWN,
      contextTruncated: false,
      lastTokenEstimate: 1234,
      contextWindow: 8192,
      conversationBudget: 4000,
      chunkIds: []
    })
    render(<ContextInspectorPanel campaignId="c1" characterIds={[]} />)
    expand()
    expect(await screen.findByText('Model context window')).toBeTruthy()
    expect(screen.getByText('8,192')).toBeTruthy()
    expect(screen.getByText('1,234')).toBeTruthy()
    expect(screen.getByText('Campaign documents')).toBeTruthy() // PHASE-24 24D row
    expect(screen.queryByText(/Preview — no AI request/)).toBeNull()
    expect(previewTokenBudget).not.toHaveBeenCalled()
  })

  it('falls back to a preview build (with note) when there is no live breakdown', async () => {
    getContextInspector.mockResolvedValue({
      breakdown: null,
      contextTruncated: false,
      lastTokenEstimate: 0,
      contextWindow: 8192,
      conversationBudget: 4000,
      chunkIds: []
    })
    previewTokenBudget.mockResolvedValue(BREAKDOWN)
    render(<ContextInspectorPanel campaignId="c1" characterIds={['pc1']} />)
    expand()
    expect(await screen.findByText(/Preview — no AI request/)).toBeTruthy()
    expect(previewTokenBudget).toHaveBeenCalledWith('c1', ['pc1'])
  })

  it('renders the truncation warning in a status region when truncated', async () => {
    getContextInspector.mockResolvedValue({
      breakdown: BREAKDOWN,
      contextTruncated: true,
      lastTokenEstimate: 9000,
      contextWindow: 8192,
      conversationBudget: 4000,
      chunkIds: []
    })
    render(<ContextInspectorPanel campaignId="c1" characterIds={[]} />)
    expand()
    const warn = await screen.findByText(/Parts of the context were dropped/)
    expect(warn.closest('[role="status"]')).toBeTruthy()
  })

  it('lists the last-turn chunk ids with a count', async () => {
    getContextInspector.mockResolvedValue({
      breakdown: BREAKDOWN,
      contextTruncated: false,
      lastTokenEstimate: 1,
      contextWindow: 8192,
      conversationBudget: 4000,
      chunkIds: ['phb-1', 'dmg-2']
    })
    render(<ContextInspectorPanel campaignId="c1" characterIds={[]} />)
    expand()
    expect(await screen.findByText(/Rules chunks used last turn \(2\)/)).toBeTruthy()
    expect(screen.getByText('phb-1')).toBeTruthy()
    expect(screen.getByText('dmg-2')).toBeTruthy()
  })

  it('shows the empty-chunks copy when no chunks were retrieved', async () => {
    getContextInspector.mockResolvedValue({
      breakdown: BREAKDOWN,
      contextTruncated: false,
      lastTokenEstimate: 1,
      contextWindow: 8192,
      conversationBudget: 4000,
      chunkIds: []
    })
    render(<ContextInspectorPanel campaignId="c1" characterIds={[]} />)
    expand()
    expect(await screen.findByText(/No rules chunks retrieved last turn/)).toBeTruthy()
  })
})
