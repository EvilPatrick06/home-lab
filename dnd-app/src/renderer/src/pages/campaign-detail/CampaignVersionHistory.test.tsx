// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))
vi.mock('../../hooks/use-toast', () => ({ addToast }))

// Deterministic translator: return the key (or key:size for the interpolated one).
vi.mock('../../i18n', () => ({
  useT: () => ({
    t: (key: string, opts?: { size?: string }) => (opts?.size ? `${key}:${opts.size}` : key)
  })
}))

const loadCampaigns = vi.fn()
vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: { getState: () => ({ loadCampaigns }) }
}))

import CampaignVersionHistory from './CampaignVersionHistory'

const listCampaignVersions = vi.fn()
const restoreCampaignVersion = vi.fn()

beforeEach(() => {
  addToast.mockClear()
  loadCampaigns.mockReset().mockResolvedValue(undefined)
  listCampaignVersions.mockReset().mockResolvedValue({
    success: true,
    data: [{ fileName: 'camp_2026-06-28T10-00-00.json', timestamp: '2026-06-28T10:00:00Z', sizeBytes: 2048 }]
  })
  restoreCampaignVersion.mockReset().mockResolvedValue({ success: true, data: { id: 'camp-1' } })
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    listCampaignVersions,
    restoreCampaignVersion
  }
})

const BTN = 'pages.campaignDetailPage.versionHistory.button'
const RESTORE = 'pages.campaignDetailPage.versionHistory.restore'

describe('CampaignVersionHistory', () => {
  it('lists the campaign versions when the history button is clicked', async () => {
    render(<CampaignVersionHistory campaignId="camp-1" />)
    fireEvent.click(screen.getByText(BTN))
    await waitFor(() => expect(listCampaignVersions).toHaveBeenCalledWith('camp-1'))
    // the version row size cell renders via the interpolated key
    await waitFor(() => expect(screen.getByText('pages.campaignDetailPage.versionHistory.size:2.0')).toBeTruthy())
  })

  it('restores a version after confirmation', async () => {
    render(<CampaignVersionHistory campaignId="camp-1" />)
    fireEvent.click(screen.getByText(BTN))
    await waitFor(() => expect(listCampaignVersions).toHaveBeenCalled())
    // open the confirm dialog from the row's Restore button
    fireEvent.click(screen.getByText(RESTORE))
    // confirm dialog adds a second Restore button — click the last one
    const restoreButtons = screen.getAllByText(RESTORE)
    fireEvent.click(restoreButtons[restoreButtons.length - 1])
    await waitFor(() => expect(restoreCampaignVersion).toHaveBeenCalledWith('camp-1', 'camp_2026-06-28T10-00-00.json'))
    await waitFor(() => expect(loadCampaigns).toHaveBeenCalled())
  })
})
