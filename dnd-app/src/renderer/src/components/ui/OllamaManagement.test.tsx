// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OllamaManagement from './OllamaManagement'

const unsubs: Array<ReturnType<typeof vi.fn>> = []
const onOllamaProgress = vi.fn(() => {
  const u = vi.fn()
  unsubs.push(u)
  return u
})

beforeEach(() => {
  unsubs.length = 0
  onOllamaProgress.mockClear()
  ;(window as unknown as { api: unknown }).api = {
    ai: {
      detectOllama: vi.fn().mockResolvedValue({ running: false, installed: false, version: null }),
      getCuratedModels: vi.fn().mockResolvedValue([]),
      getVram: vi.fn().mockResolvedValue({ totalMB: 0 }),
      listInstalledModelsDetailed: vi.fn().mockResolvedValue([]),
      onOllamaProgress
    }
  }
})

afterEach(() => vi.clearAllMocks())

describe('OllamaManagement listener lifecycle (05D)', () => {
  it('registers exactly one onOllamaProgress listener per mount', () => {
    render(<OllamaManagement />)
    expect(onOllamaProgress).toHaveBeenCalledTimes(1)
    expect(unsubs[0]).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<OllamaManagement />)
    unmount()
    expect(unsubs[0]).toHaveBeenCalledTimes(1)
  })

  it('leaves exactly one live listener across mount→unmount→mount (no accumulation)', () => {
    const first = render(<OllamaManagement />)
    first.unmount()
    render(<OllamaManagement />)
    expect(onOllamaProgress).toHaveBeenCalledTimes(2)
    expect(unsubs[0]).toHaveBeenCalledTimes(1) // first detached
    expect(unsubs[1]).not.toHaveBeenCalled() // second live
  })
})

describe('OllamaManagement web-build gate (PHASE-45 F4)', () => {
  afterEach(() => {
    ;(window as unknown as { __DND_WEB__?: boolean }).__DND_WEB__ = undefined
  })

  it('shows a web notice and no Install button when Ollama is not installed in the web build', async () => {
    ;(window as unknown as { __DND_WEB__?: boolean }).__DND_WEB__ = true
    render(<OllamaManagement />)
    await waitFor(() => expect(screen.getByText(/isn't reachable from this browser build/i)).toBeTruthy())
    expect(screen.queryByRole('button', { name: /^install ollama$/i })).toBeNull()
  })

  it('shows the Install button (not the web notice) on desktop', async () => {
    ;(window as unknown as { __DND_WEB__?: boolean }).__DND_WEB__ = undefined
    render(<OllamaManagement />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^install ollama$/i })).toBeTruthy())
    expect(screen.queryByText(/isn't reachable from this browser build/i)).toBeNull()
  })
})
