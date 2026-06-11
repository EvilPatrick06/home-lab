// @vitest-environment happy-dom
import { render } from '@testing-library/react'
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
      onOllamaProgress
    }
  }
})

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
