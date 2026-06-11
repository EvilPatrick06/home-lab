// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('../../hooks/use-toast', () => ({ addToast }))

import AiDmCard from './AiDmCard'

const configure = vi.fn()
const saveCampaign = vi.fn()

beforeEach(() => {
  addToast.mockClear()
  configure.mockReset().mockResolvedValue({ success: true })
  saveCampaign.mockReset().mockResolvedValue(undefined)
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
      onOllamaProgress: vi.fn(() => vi.fn())
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
})
