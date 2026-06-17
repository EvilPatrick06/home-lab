// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
const { saveCampaign } = vi.hoisted(() => ({ saveCampaign: vi.fn(async () => {}) }))
vi.mock('../../../hooks/use-toast', () => ({ addToast }))
vi.mock('../../../stores/use-campaign-store', () => ({
  useCampaignStore: { getState: () => ({ saveCampaign }) }
}))

import AiModelSwapPopover from './AiModelSwapPopover'

const getConfig = vi.fn()
const listInstalledModels = vi.fn()
const listCloudModels = vi.fn()
const configure = vi.fn()

// biome-ignore lint/suspicious/noExplicitAny: minimal campaign fixture
function campaign(): any {
  return { id: 'c1', name: 'Test', players: [], aiDm: { enabled: true, provider: 'ollama', model: 'llama3.1' } }
}

beforeEach(() => {
  getConfig.mockResolvedValue({ provider: 'ollama', model: 'llama3.1', ollamaUrl: 'http://localhost:11434' })
  listInstalledModels.mockResolvedValue(['llama3.1', 'mistral'])
  listCloudModels.mockResolvedValue([])
  configure.mockResolvedValue({ success: true })
  // biome-ignore lint/suspicious/noExplicitAny: test stub of the preload api surface
  ;(window as any).api = { ai: { getConfig, listInstalledModels, listCloudModels, configure } }
})
afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: cleanup
  ;(window as any).api = undefined
  vi.clearAllMocks()
})

describe('AiModelSwapPopover (PHASE-29 29D)', () => {
  it('opens, lists installed models, and preselects the current model', async () => {
    render(<AiModelSwapPopover campaign={campaign()} disabled={false} />)
    fireEvent.click(screen.getByText('Change model'))
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    expect(screen.getByText('Current: llama3.1')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy())
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('llama3.1')
  })

  it('Apply configures the merged config, persists the campaign model, and toasts', async () => {
    render(<AiModelSwapPopover campaign={campaign()} disabled={false} />)
    fireEvent.click(screen.getByText('Change model'))
    await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mistral' } })
    fireEvent.click(screen.getByText('Apply'))
    await waitFor(() => expect(configure).toHaveBeenCalled())
    expect(configure.mock.calls.at(-1)?.[0]).toMatchObject({
      provider: 'ollama',
      model: 'mistral',
      ollamaUrl: 'http://localhost:11434'
    })
    await waitFor(() => expect(saveCampaign).toHaveBeenCalled())
    const savedCampaign = (saveCampaign.mock.calls[0] as unknown[])[0] as { aiDm: { model: string } }
    expect(savedCampaign.aiDm.model).toBe('mistral')
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining('mistral'), 'success')
  })

  it('disables the trigger while a stream is in flight', () => {
    render(<AiModelSwapPopover campaign={campaign()} disabled={true} />)
    expect((screen.getByText('Change model') as HTMLButtonElement).disabled).toBe(true)
  })
})
