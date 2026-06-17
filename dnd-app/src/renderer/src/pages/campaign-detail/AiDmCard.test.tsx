// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('../../hooks/use-toast', () => ({ addToast }))

import AiDmCard from './AiDmCard'

const configure = vi.fn()
const saveCampaign = vi.fn()
const sceneMemoryGet = vi.fn()
const sceneMemorySetEnabled = vi.fn()

beforeEach(() => {
  addToast.mockClear()
  configure.mockReset().mockResolvedValue({ success: true })
  saveCampaign.mockReset().mockResolvedValue(undefined)
  sceneMemoryGet.mockReset().mockResolvedValue({
    success: true,
    data: {
      enabled: false,
      sceneSummaryCount: 0,
      sessionSummaryCount: 0,
      hasCampaignSummary: false,
      currentSceneMessageCount: 0
    }
  })
  sceneMemorySetEnabled.mockReset().mockResolvedValue({ success: true })
  // biome-ignore lint/suspicious/noExplicitAny: test-only window augmentation (don't replace window — nukes document)
  ;(window as any).api = {
    ai: {
      configure,
      detectOllama: vi.fn().mockResolvedValue({ running: false, installed: false, version: null }),
      getVram: vi.fn().mockResolvedValue({ totalMB: 0 }),
      getCuratedModels: vi.fn().mockResolvedValue([]),
      listInstalledModels: vi.fn().mockResolvedValue([]),
      listCloudModels: vi.fn().mockResolvedValue([{ id: 'gemini-2.0-flash', name: 'gemini-2.0-flash' }]),
      validateApiKey: vi.fn().mockResolvedValue({ valid: true }),
      onOllamaProgress: vi.fn(() => vi.fn()),
      getEmbedIndexStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
      onEmbedIndexProgress: vi.fn(() => vi.fn()),
      rebuildEmbedIndex: vi.fn().mockResolvedValue({ success: true }),
      sceneMemoryGet,
      sceneMemorySetEnabled
    }
  }
})
afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: cleanup
  ;(window as any).api = undefined
  vi.clearAllMocks()
})

// biome-ignore lint/suspicious/noExplicitAny: minimal campaign fixture
function campaignWith(aiDm: any): any {
  return { id: 'c1', name: 'Test', players: [], aiDm }
}

function passwordInput(): HTMLInputElement {
  return document.querySelector('input[type="password"]') as HTMLInputElement
}

describe('AiDmCard (PHASE-10 10H)', () => {
  it('prefills the key for the CONFIGURED provider, not the first non-null one', () => {
    render(
      <AiDmCard
        campaign={campaignWith({
          enabled: true,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          claudeApiKey: 'ck',
          geminiApiKey: 'gk'
        })}
        saveCampaign={saveCampaign}
      />
    )
    fireEvent.click(screen.getByText('Configure'))
    expect(passwordInput().value).toBe('gk')
  })

  it("preserves other providers' keys on Save", async () => {
    render(
      <AiDmCard
        campaign={campaignWith({
          enabled: true,
          provider: 'claude',
          model: 'm',
          claudeApiKey: 'ck',
          geminiApiKey: 'gk'
        })}
        saveCampaign={saveCampaign}
      />
    )
    fireEvent.click(screen.getByText('Configure'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(saveCampaign).toHaveBeenCalled())
    const savedAiDm = saveCampaign.mock.calls[0][0].aiDm
    expect(savedAiDm.geminiApiKey).toBe('gk')
    expect(savedAiDm.claudeApiKey).toBe('ck')
  })

  it('surfaces a configure failure and keeps the modal open', async () => {
    configure.mockResolvedValue({ success: false, error: 'bad key' })
    render(
      <AiDmCard
        campaign={campaignWith({ enabled: true, provider: 'claude', model: 'm', claudeApiKey: 'ck' })}
        saveCampaign={saveCampaign}
      />
    )
    fireEvent.click(screen.getByText('Configure'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(addToast).toHaveBeenCalledWith(expect.stringMatching(/bad key/), 'error'))
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  // PHASE-23 23D: structured-extraction select (Ollama-gated).
  it('hides the structured-extraction select for a cloud provider', () => {
    render(
      <AiDmCard
        campaign={campaignWith({ enabled: true, provider: 'gemini', model: 'gemini-2.0-flash', geminiApiKey: 'gk' })}
        saveCampaign={saveCampaign}
      />
    )
    fireEvent.click(screen.getByText('Configure'))
    expect(screen.queryByLabelText('Structured extraction')).toBeNull()
  })

  it('shows the select for Ollama, defaults off, and persists the chosen mode', async () => {
    render(
      <AiDmCard
        campaign={campaignWith({
          enabled: true,
          provider: 'ollama',
          model: 'llama3.1',
          ollamaUrl: 'http://localhost:11434'
        })}
        saveCampaign={saveCampaign}
      />
    )
    fireEvent.click(screen.getByText('Configure'))
    const select = screen.getByLabelText('Structured extraction') as HTMLSelectElement
    expect(select.value).toBe('off')
    fireEvent.change(select, { target: { value: 'always' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(saveCampaign).toHaveBeenCalled())
    expect(saveCampaign.mock.calls[0][0].aiDm.structuredExtraction).toBe('always')
    await waitFor(() => expect(configure).toHaveBeenCalled())
    expect(configure.mock.calls[0][0].structuredExtraction).toBe('always')
  })

  // PHASE-24: rag retrieval fields.
  it('persists semantic-search + campaign-doc fields for Ollama', async () => {
    render(
      <AiDmCard
        campaign={campaignWith({
          enabled: true,
          provider: 'ollama',
          model: 'llama3.1',
          ollamaUrl: 'http://localhost:11434'
        })}
        saveCampaign={saveCampaign}
      />
    )
    fireEvent.click(screen.getByText('Configure'))
    fireEvent.click(screen.getByText(/Semantic rules search/))
    fireEvent.click(screen.getByText(/search this campaign's lore/))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(saveCampaign).toHaveBeenCalled())
    const saved = saveCampaign.mock.calls[0][0].aiDm
    expect(saved.ragEmbeddingsEnabled).toBe(true)
    // checkbox default for a previously-saved (non-null aiDm) campaign is the saved value (false) → toggled true
    expect(saved.ragCampaignDocsEnabled).toBe(true)
    await waitFor(() => expect(configure).toHaveBeenCalled())
    expect(configure.mock.calls[0][0].ragEmbeddingsEnabled).toBe(true)
  })

  it('defaults campaign-doc search ON for a never-configured campaign', () => {
    render(<AiDmCard campaign={campaignWith(undefined)} saveCampaign={saveCampaign} />)
    fireEvent.click(screen.getByText(/Enable AI DM|Enable/))
    const checkbox = screen
      .getByText(/search this campaign's lore/)
      .closest('label')
      ?.querySelector('input')
    expect((checkbox as HTMLInputElement).checked).toBe(true)
  })

  it('disables Save while saving', async () => {
    let resolveSave: () => void = () => {}
    saveCampaign.mockReturnValue(new Promise<void>((r) => (resolveSave = r)))
    render(
      <AiDmCard
        campaign={campaignWith({ enabled: true, provider: 'claude', model: 'm', claudeApiKey: 'ck' })}
        saveCampaign={saveCampaign}
      />
    )
    fireEvent.click(screen.getByText('Configure'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect((screen.getByText('Saving...') as HTMLButtonElement).disabled).toBe(true))
    resolveSave()
  })

  // PHASE-26 26E — scene-memory toggle
  describe('scene memory toggle', () => {
    it('renders for an AI-enabled campaign and loads the flag on mount', async () => {
      render(
        <AiDmCard
          campaign={campaignWith({ enabled: true, provider: 'ollama', model: 'm' })}
          saveCampaign={saveCampaign}
        />
      )
      expect(screen.getByText('Scene-based AI memory (experimental)')).toBeTruthy()
      await waitFor(() => expect(sceneMemoryGet).toHaveBeenCalledWith('c1'))
    })

    it('toggling it invokes sceneMemorySetEnabled', async () => {
      render(
        <AiDmCard
          campaign={campaignWith({ enabled: true, provider: 'ollama', model: 'm' })}
          saveCampaign={saveCampaign}
        />
      )
      const checkbox = screen.getByLabelText('Scene-based AI memory (experimental)')
      fireEvent.click(checkbox)
      await waitFor(() => expect(sceneMemorySetEnabled).toHaveBeenCalledWith('c1', true))
    })

    it('is hidden when the AI DM is not enabled', () => {
      render(<AiDmCard campaign={campaignWith(undefined)} saveCampaign={saveCampaign} />)
      expect(screen.queryByText('Scene-based AI memory (experimental)')).toBeNull()
    })
  })
})
