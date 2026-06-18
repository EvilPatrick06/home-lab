// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadBuiltInSeedPacks, applySeedPackToCampaign, seedQuestsFromPack, saveCampaign } = vi.hoisted(() => ({
  loadBuiltInSeedPacks: vi.fn(),
  applySeedPackToCampaign: vi.fn((_c: unknown, _p: unknown, _o?: Record<string, boolean>) => ({ id: 'c1', name: 'C' })),
  seedQuestsFromPack: vi.fn(async () => ({ success: true, added: 0 })),
  saveCampaign: vi.fn(async () => {})
}))
vi.mock('../../services/seed-packs/built-in-packs', () => ({ loadBuiltInSeedPacks }))
vi.mock('../../services/seed-packs/seed-pack-apply', () => ({ applySeedPackToCampaign }))
vi.mock('../../services/seed-packs/seed-quests', () => ({ seedQuestsFromPack }))
vi.mock('../../services/seed-packs/seed-pack-io', () => ({ importSeedPackFromFile: vi.fn() }))
vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: (sel: (s: { saveCampaign: typeof saveCampaign }) => unknown) => sel({ saveCampaign })
}))

import type { SeedPack } from '../../services/seed-packs/seed-pack-schema'
import type { Campaign } from '../../types/campaign'
import SeedPackApplyModal from './SeedPackApplyModal'

const PACK = {
  format: 'dnd-vtt-seed-pack',
  formatVersion: 1,
  id: 'hollowmere',
  name: 'The Hollowmere',
  description: 'd',
  system: 'dnd5e',
  lore: [{ id: 'l1', title: 'A', content: 'x', category: 'world' }],
  npcs: [{ id: 'n1', name: 'Maren', description: 'd' }]
} as unknown as SeedPack

const campaign = { id: 'c1', name: 'C', npcs: [], lore: [] } as unknown as Campaign

beforeEach(() => {
  vi.clearAllMocks()
  loadBuiltInSeedPacks.mockResolvedValue([PACK])
})

describe('SeedPackApplyModal (PHASE-37 37E)', () => {
  it('section checkboxes gate the options passed to applySeedPackToCampaign', async () => {
    render(<SeedPackApplyModal open={true} onClose={() => {}} campaign={campaign} onApplied={() => {}} />)
    await waitFor(() => expect(screen.getByText('The Hollowmere')).toBeTruthy())
    fireEvent.click(screen.getByText('The Hollowmere')) // select → shows section checkboxes
    await waitFor(() => expect(screen.getByLabelText('NPCs')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('NPCs')) // uncheck NPCs
    fireEvent.click(screen.getByText('Apply'))
    await waitFor(() => expect(applySeedPackToCampaign).toHaveBeenCalled())
    const opts = applySeedPackToCampaign.mock.calls[0][2] as Record<string, boolean>
    expect(opts.npcs).toBe(false)
    expect(opts.lore).toBe(true)
    expect(saveCampaign).toHaveBeenCalled()
  })

  it('does not render content when closed', () => {
    render(<SeedPackApplyModal open={false} onClose={() => {}} campaign={campaign} onApplied={() => {}} />)
    expect(screen.queryByText('The Hollowmere')).toBeNull()
  })
})
