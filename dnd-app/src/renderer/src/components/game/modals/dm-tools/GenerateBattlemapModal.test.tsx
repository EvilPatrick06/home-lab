// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { applyBattlemapSpec } = vi.hoisted(() => ({ applyBattlemapSpec: vi.fn() }))
vi.mock('../../../../services/map/battlemap/apply-spec', () => ({ applyBattlemapSpec }))
vi.mock('../../../../services/map/battlemap/compile-spec', () => ({ compileSpec: () => ({}) }))
vi.mock('../../../../services/map/battlemap/tile-renderer', () => ({
  renderBattlemap: () => 'data:image/png;base64,PREVIEW'
}))
vi.mock('../../../../services/active-campaign-ref', () => ({ getActiveCampaignId: () => 'c1' }))
vi.mock('../../../../stores/store-accessors', () => ({
  getGameStore: vi.fn(),
  getLobbyStore: vi.fn(),
  getNetworkStore: vi.fn()
}))

import GenerateBattlemapModal from './GenerateBattlemapModal'

const generateBattlemap = vi.fn(async () => ({
  success: true,
  spec: { name: 'Crypt', theme: 'crypt', width: 20, height: 20 },
  warnings: []
}))

beforeEach(() => {
  vi.clearAllMocks()
  generateBattlemap.mockResolvedValue({
    success: true,
    spec: { name: 'Crypt', theme: 'crypt', width: 20, height: 20 },
    warnings: []
  })
  // @ts-expect-error — test stub of the preload bridge
  window.api = { ai: { generateBattlemap } }
})

describe('GenerateBattlemapModal (PHASE-34 34F)', () => {
  it('Generate is disabled until a description is entered', () => {
    render(<GenerateBattlemapModal onClose={() => {}} />)
    expect((screen.getByText('Generate') as HTMLButtonElement).disabled).toBe(true)
  })

  it('success path shows the preview + a Create button; Create applies the spec', async () => {
    render(<GenerateBattlemapModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/two-room crypt/i), { target: { value: 'a crypt' } })
    fireEvent.click(screen.getByText('Generate'))
    await waitFor(() =>
      expect(generateBattlemap).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'c1', prompt: 'a crypt' }))
    )
    const img = (await screen.findByRole('img')) as HTMLImageElement
    expect(img.src).toContain('PREVIEW')
    fireEvent.click(screen.getByText('Create map'))
    expect(applyBattlemapSpec).toHaveBeenCalledTimes(1)
  })

  it('error envelope renders the message inline', async () => {
    generateBattlemap.mockResolvedValue({ success: false, error: 'no provider' } as never)
    render(<GenerateBattlemapModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/two-room crypt/i), { target: { value: 'a crypt' } })
    fireEvent.click(screen.getByText('Generate'))
    expect(await screen.findByText('no provider')).toBeTruthy()
    expect(applyBattlemapSpec).not.toHaveBeenCalled()
  })
})
