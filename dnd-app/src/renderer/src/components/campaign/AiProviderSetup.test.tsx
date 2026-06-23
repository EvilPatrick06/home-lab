// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AiProviderSetup from './AiProviderSetup'

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
      getVram: vi.fn().mockResolvedValue({ totalMB: 0 }),
      getCuratedModels: vi.fn().mockResolvedValue([]),
      listInstalledModels: vi.fn().mockResolvedValue([]),
      listCloudModels: vi.fn().mockResolvedValue([]),
      validateApiKey: vi.fn().mockResolvedValue({ valid: false }),
      onOllamaProgress
    }
  }
})

const api = () => (window as any).api.ai

afterEach(() => vi.clearAllMocks())

const props = {
  enabled: true,
  provider: 'ollama' as const,
  model: '',
  ollamaUrl: 'http://localhost:11434',
  apiKey: '',
  onProviderReady: vi.fn(),
  onChange: vi.fn()
}

describe('AiProviderSetup listener lifecycle (05D)', () => {
  it('registers exactly one onOllamaProgress listener per mount', () => {
    render(<AiProviderSetup {...props} />)
    expect(onOllamaProgress).toHaveBeenCalledTimes(1)
    expect(unsubs[0]).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<AiProviderSetup {...props} />)
    unmount()
    expect(unsubs[0]).toHaveBeenCalledTimes(1)
  })

  it('leaves exactly one live listener across mount→unmount→mount (no accumulation)', () => {
    const first = render(<AiProviderSetup {...props} />)
    first.unmount()
    render(<AiProviderSetup {...props} />)
    expect(onOllamaProgress).toHaveBeenCalledTimes(2)
    expect(unsubs[0]).toHaveBeenCalledTimes(1)
    expect(unsubs[1]).not.toHaveBeenCalled()
  })
})

describe('AiProviderSetup detect failure (PHASE-10 10G/F7)', () => {
  it('surfaces a retryable error when detection rejects', async () => {
    api().detectOllama.mockRejectedValue(new Error('no ipc'))
    render(<AiProviderSetup {...props} />)
    await waitFor(() => expect(screen.getByText(/Couldn't check the local AI install/)).toBeTruthy())
    api().detectOllama.mockResolvedValueOnce({ running: false, installed: false, version: null })
    fireEvent.click(screen.getByText('Retry detection'))
    await waitFor(() => expect(api().detectOllama).toHaveBeenCalledTimes(2))
  })
})

describe('AiProviderSetup cloud dropdown states (PHASE-10 10G/F8)', () => {
  const cloud = { ...props, provider: 'claude' as const, apiKey: 'sk-x' }

  it('shows a loading option while the model list is pending', async () => {
    let resolve: (v: Array<{ id: string; name: string }>) => void = () => {}
    api().listCloudModels.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<AiProviderSetup {...cloud} />)
    await waitFor(() => expect(screen.getByText('Loading models...')).toBeTruthy())
    resolve([])
  })

  it('shows the error line + retry when the list rejects', async () => {
    api().listCloudModels.mockRejectedValue(new Error('network'))
    render(<AiProviderSetup {...cloud} />)
    await waitFor(() => expect(screen.getByText(/Couldn't load the model list/)).toBeTruthy())
  })

  it('shows the empty-state hint when the list resolves empty', async () => {
    api().listCloudModels.mockResolvedValue([])
    render(<AiProviderSetup {...cloud} />)
    await waitFor(() => expect(screen.getByText(/Enter a valid API key/)).toBeTruthy())
  })

  it('renders an option with no dangling separator when desc is absent', async () => {
    api().listCloudModels.mockResolvedValue([{ id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' }])
    render(<AiProviderSetup {...cloud} />)
    await waitFor(() => {
      const opt = screen.getByText('claude-sonnet-4-6')
      expect(opt.textContent).not.toContain('—')
    })
  })
})

describe('AiProviderSetup validated-key gating (PHASE-10 10G/F9)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reports not-ready for a key that fails validation', async () => {
    api().validateApiKey.mockResolvedValue({ valid: false })
    const onProviderReady = vi.fn()
    render(<AiProviderSetup {...props} provider="claude" apiKey="garbage" onProviderReady={onProviderReady} />)
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(0)
    expect(api().validateApiKey).toHaveBeenCalled()
    expect(onProviderReady.mock.calls.at(-1)?.[0]).toBe(false)
  })

  it('reports ready once a valid key validates', async () => {
    api().validateApiKey.mockResolvedValue({ valid: true })
    const onProviderReady = vi.fn()
    render(<AiProviderSetup {...props} provider="claude" apiKey="sk-good" onProviderReady={onProviderReady} />)
    await vi.advanceTimersByTimeAsync(700)
    await vi.advanceTimersByTimeAsync(0)
    expect(onProviderReady.mock.calls.some((c) => c[0] === true)).toBe(true)
  })
})
