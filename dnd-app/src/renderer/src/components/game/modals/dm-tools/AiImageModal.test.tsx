// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const addHandout = vi.fn()
const updateToken = vi.fn()
const sendMessage = vi.fn()
const gameState = {
  addHandout,
  updateToken,
  maps: [{ id: 'm1', tokens: [{ id: 't1', label: 'Goblin' }] }],
  activeMapId: 'm1'
}
const aiState = { messages: [] as Array<{ role: string; content: string }> }
const campaignState = {
  getActiveCampaign: () => ({ id: 'c1', npcs: [{ id: 'n1', name: 'Duke' }] }),
  saveCampaign: vi.fn(async () => {})
}

vi.mock('../../../../stores/use-game-store', () => ({
  useGameStore: Object.assign((sel: (s: typeof gameState) => unknown) => sel(gameState), { getState: () => gameState })
}))
vi.mock('../../../../stores/use-ai-dm-store', () => ({
  useAiDmStore: Object.assign((sel: (s: typeof aiState) => unknown) => sel(aiState), { getState: () => aiState })
}))
vi.mock('../../../../stores/use-campaign-store', () => ({
  useCampaignStore: Object.assign((sel: (s: typeof campaignState) => unknown) => sel(campaignState), {
    getState: () => campaignState
  })
}))
vi.mock('../../../../stores/network-store', () => ({ useNetworkStore: { getState: () => ({ sendMessage }) } }))

import AiImageModal from './AiImageModal'

const getConfig = vi.fn(async () => ({ enabled: true }))
const generate = vi.fn(async () => ({
  success: true,
  dataUrl: 'data:image/png;base64,QUJD',
  imageId: 'aiimg-1',
  provider: 'openai',
  model: 'gpt-image-1'
}))
const onProgress = vi.fn()
const removeProgressListener = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  getConfig.mockResolvedValue({ enabled: true })
  // @ts-expect-error — test stub of the preload bridge
  window.api = { aiImage: { getConfig, generate, onProgress, removeProgressListener } }
})

async function genAndWait(): Promise<void> {
  fireEvent.change(screen.getByPlaceholderText(/Describe what to generate/i), { target: { value: 'a grizzled dwarf' } })
  fireEvent.click(screen.getByText('Generate'))
  await screen.findByText(/saved to image library/i)
}

describe('AiImageModal (PHASE-33 33F)', () => {
  it('renders the disabled empty state and never calls generate when off', async () => {
    getConfig.mockResolvedValue({ enabled: false })
    render(<AiImageModal onClose={() => {}} />)
    expect(await screen.findByText(/disabled/i)).toBeTruthy()
    expect(screen.queryByText('Generate')).toBeNull()
    expect(generate).not.toHaveBeenCalled()
  })

  it('happy path renders the preview image with the returned data URL', async () => {
    render(<AiImageModal onClose={() => {}} />)
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    await genAndWait()
    const img = document.querySelector('img') as HTMLImageElement
    expect(img.src).toContain('data:image/png;base64,QUJD')
  })

  it('handout attach adds a dm-only image handout; share checkbox broadcasts', async () => {
    render(<AiImageModal onClose={() => {}} />)
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    await genAndWait()
    fireEvent.click(screen.getByText('Add as handout'))
    expect(addHandout).toHaveBeenCalledTimes(1)
    const handout = addHandout.mock.calls[0][0] as { contentType: string; visibility: string }
    expect(handout.contentType).toBe('image')
    expect(handout.visibility).toBe('dm')
    expect(sendMessage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText(/Share with players/i))
    fireEvent.click(screen.getByText('Add as handout'))
    expect(sendMessage).toHaveBeenCalledWith('dm:share-handout', expect.anything())
  })

  it('removes the progress listener on unmount', async () => {
    const { unmount } = render(<AiImageModal onClose={() => {}} />)
    await waitFor(() => expect(getConfig).toHaveBeenCalled())
    unmount()
    expect(removeProgressListener).toHaveBeenCalled()
  })
})
