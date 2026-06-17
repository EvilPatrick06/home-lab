// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiImageSetup from './AiImageSetup'

const getConfig = vi.fn(async () => ({ enabled: false, provider: 'sd-webui', sdWebuiUrl: 'http://127.0.0.1:7860' }))
const configure = vi.fn(
  async (_cfg: Record<string, unknown>): Promise<{ success: boolean; error?: string }> => ({ success: true })
)
const checkProviders = vi.fn(async () => ({ sdWebui: true, openai: false, gemini: false }))

beforeEach(() => {
  getConfig.mockClear()
  configure.mockClear()
  checkProviders.mockClear()
  configure.mockResolvedValue({ success: true })
  // @ts-expect-error — test stub of the preload bridge
  window.api = { aiImage: { getConfig, configure, checkProviders } }
})

describe('AiImageSetup (PHASE-33 33E)', () => {
  it('loads config on mount (enabled off by default)', async () => {
    render(<AiImageSetup />)
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    const enable = screen.getByLabelText(/Enable AI image generation/i) as HTMLInputElement
    expect(enable.checked).toBe(false)
  })

  it('toggling enable + editing the URL + Save calls configure with the new values', async () => {
    render(<AiImageSetup />)
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText(/Enable AI image generation/i))
    fireEvent.change(screen.getByDisplayValue('http://127.0.0.1:7860'), { target: { value: 'http://10.0.0.5:7860' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(configure).toHaveBeenCalled())
    const arg = configure.mock.calls[0][0] as { enabled: boolean; sdWebuiUrl: string }
    expect(arg.enabled).toBe(true)
    expect(arg.sdWebuiUrl).toBe('http://10.0.0.5:7860')
  })

  it('Test connection renders per-provider status chips', async () => {
    render(<AiImageSetup />)
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Test connection'))
    expect(await screen.findByText(/SD ✓/)).toBeTruthy()
    expect(screen.getByText(/OpenAI no key/)).toBeTruthy()
  })

  it('surfaces a configure failure envelope', async () => {
    configure.mockResolvedValue({ success: false, error: 'disk full' })
    render(<AiImageSetup />)
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('disk full')).toBeTruthy()
  })
})
