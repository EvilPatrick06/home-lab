// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiReadiness } from './use-ai-readiness'

const getConfig = vi.fn()
const checkProviders = vi.fn()
const getTokenMeter = vi.fn()

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

beforeEach(() => {
  vi.useFakeTimers()
  getConfig.mockReset()
  checkProviders.mockReset()
  getTokenMeter.mockReset()
  getConfig.mockResolvedValue({ provider: 'gemini' })
  checkProviders.mockResolvedValue({
    ollama: false,
    ollamaModels: [],
    ollamaHasUsableModel: false,
    claude: false,
    openai: false,
    gemini: true
  })
  getTokenMeter.mockResolvedValue({ conversationBudget: 4000, contextWindow: 8000 })
  setVisibility('visible')
  vi.stubGlobal('window', { api: { ai: { getConfig, checkProviders, getTokenMeter } } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useAiReadiness (PHASE-10 10B)', () => {
  it('runs an initial probe and maps the provider field', async () => {
    const { result } = renderHook(() => useAiReadiness(true))
    await flush()
    expect(getConfig).toHaveBeenCalledTimes(1)
    expect(result.current.usable).toBe(true)
    expect(result.current.provider).toBe('gemini')
    expect(result.current.probeFailed).toBe(false)
    expect(result.current.conversationBudget).toBe(4000)
  })

  it('exposes a null budget when the meter IPC fails but readiness still resolves', async () => {
    getTokenMeter.mockRejectedValueOnce(new Error('no meter'))
    const { result } = renderHook(() => useAiReadiness(true))
    await flush()
    expect(result.current.usable).toBe(true)
    expect(result.current.conversationBudget).toBeNull()
  })

  it('re-probes on the 30s tick', async () => {
    renderHook(() => useAiReadiness(true))
    await flush()
    expect(getConfig).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(getConfig).toHaveBeenCalledTimes(2)
  })

  it('skips the tick when the document is hidden', async () => {
    renderHook(() => useAiReadiness(true))
    await flush()
    expect(getConfig).toHaveBeenCalledTimes(1)
    setVisibility('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(getConfig).toHaveBeenCalledTimes(1)
  })

  it('sets probeFailed on error instead of silently nulling', async () => {
    getConfig.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAiReadiness(true))
    await flush()
    expect(result.current.probeFailed).toBe(true)
  })

  it('does not probe when inactive', async () => {
    renderHook(() => useAiReadiness(false))
    await flush()
    expect(getConfig).not.toHaveBeenCalled()
  })
})
