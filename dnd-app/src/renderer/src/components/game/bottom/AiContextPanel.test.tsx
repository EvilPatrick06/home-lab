// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('../../../hooks/use-toast', () => ({ addToast }))

const listMemoryFiles = vi.fn()
const clearMemory = vi.fn()
const readMemoryFile = vi.fn()

import AiContextPanel from './AiContextPanel'

beforeEach(() => {
  addToast.mockClear()
  listMemoryFiles.mockReset()
  clearMemory.mockReset()
  readMemoryFile.mockReset()
  // Assign onto the existing happy-dom window (don't replace it — that nukes `document`).
  ;(window as any).api = { ai: { listMemoryFiles, clearMemory, readMemoryFile } }
  ;(window as any).confirm = () => true
})
afterEach(() => {
  ;(window as any).api = undefined
})

describe('AiContextPanel honest error states (PHASE-10 10F)', () => {
  it('renders the load-failed line (not "no files") when listing rejects', async () => {
    listMemoryFiles.mockRejectedValue(new Error('disk gone'))
    render(<AiContextPanel campaignId="c1" />)
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load AI memory files/)).toBeTruthy()
    })
    expect(screen.queryByText(/No memory files yet/)).toBeNull()
  })

  it('shows the empty state when listing resolves empty', async () => {
    listMemoryFiles.mockResolvedValue([])
    render(<AiContextPanel campaignId="c1" />)
    await waitFor(() => {
      expect(screen.getByText(/No memory files yet/)).toBeTruthy()
    })
  })

  it('toasts an error when clearing fails', async () => {
    listMemoryFiles.mockResolvedValue([{ name: 'mem.json', size: 100 }])
    clearMemory.mockRejectedValue(new Error('locked'))
    render(<AiContextPanel campaignId="c1" />)
    await waitFor(() => expect(screen.getByText('mem.json')).toBeTruthy())
    fireEvent.click(screen.getByText('Clear Memory'))
    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(expect.stringMatching(/Couldn't clear AI memory/), 'error')
    })
  })

  it('re-lists from disk after a successful clear', async () => {
    listMemoryFiles.mockResolvedValue([{ name: 'mem.json', size: 100 }])
    clearMemory.mockResolvedValue(undefined)
    render(<AiContextPanel campaignId="c1" />)
    await waitFor(() => expect(screen.getByText('mem.json')).toBeTruthy())
    expect(listMemoryFiles).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Clear Memory'))
    await waitFor(() => expect(clearMemory).toHaveBeenCalled())
    // success path calls refresh() → a second listMemoryFiles
    await waitFor(() => expect(listMemoryFiles).toHaveBeenCalledTimes(2))
  })
})
