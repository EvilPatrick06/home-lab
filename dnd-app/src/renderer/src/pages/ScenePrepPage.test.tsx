// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ campaignId: 'camp-1' })
}))

vi.mock('../services/ai-dm-routing', () => ({ configureAiFromCampaign: vi.fn(async () => undefined) }))

import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useCampaignStore } from '../stores/use-campaign-store'
import ScenePrepPage from './ScenePrepPage'

const aiCampaign = {
  id: 'camp-1',
  name: 'Test Campaign',
  aiDm: { enabled: true },
  players: []
} as never

beforeEach(() => {
  navigate.mockClear()
  ;(window as unknown as { api: unknown }).api = {
    loadCampaigns: vi.fn().mockResolvedValue([]),
    ai: {
      prepareScene: vi.fn().mockResolvedValue({ success: true, streamId: 's1' }),
      getSceneStatus: vi.fn().mockResolvedValue({ status: 'preparing', streamId: 's1' }),
      cancelScene: vi.fn().mockResolvedValue({ success: true }),
      loadConversation: vi.fn().mockResolvedValue({ success: false })
    }
  }
  // Neutralize the mount-effect reload so tests fully control loading/campaigns state.
  vi.spyOn(useCampaignStore.getState(), 'loadCampaigns').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  useCampaignStore.setState({ campaigns: [], loading: false })
  useAiDmStore.setState({ sceneStatus: 'idle', sceneError: null, sceneStreamId: null, enabled: false })
})

describe('ScenePrepPage (06F)', () => {
  it('unknown campaign + not loading → shows not-found message and a working back button', () => {
    useCampaignStore.setState({ campaigns: [], loading: false })
    render(<ScenePrepPage />)
    expect(screen.getByText(/Campaign not found/)).toBeTruthy()
    fireEvent.click(screen.getByText('Back to main menu'))
    expect(navigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('unknown campaign + loading → shows a spinner, not the not-found message', () => {
    useCampaignStore.setState({ campaigns: [], loading: true })
    const { container } = render(<ScenePrepPage />)
    expect(screen.queryByText(/Campaign not found/)).toBeNull()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('known AI campaign in preparing state → Cancel invokes the scene cancel IPC', () => {
    useCampaignStore.setState({ campaigns: [aiCampaign], loading: false })
    useAiDmStore.setState({ enabled: true, sceneStatus: 'preparing', sceneError: null })
    render(<ScenePrepPage />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(
      (window as unknown as { api: { ai: { cancelScene: ReturnType<typeof vi.fn> } } }).api.ai.cancelScene
    ).toHaveBeenCalledWith('camp-1')
  })
})
