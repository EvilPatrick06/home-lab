// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadBuiltInSeedPacks } = vi.hoisted(() => ({ loadBuiltInSeedPacks: vi.fn() }))
vi.mock('../../services/seed-packs/built-in-packs', () => ({ loadBuiltInSeedPacks }))
vi.mock('../../services/seed-packs/seed-pack-io', () => ({ importSeedPackFromFile: vi.fn() }))

import type { SeedPack } from '../../services/seed-packs/seed-pack-schema'
import SeedPackStep from './SeedPackStep'

const PACK = {
  format: 'dnd-vtt-seed-pack',
  formatVersion: 1,
  id: 'hollowmere',
  name: 'The Hollowmere',
  description: 'd',
  system: 'dnd5e',
  lore: [{ id: 'l1', title: 'A', content: 'x', category: 'world' }]
} as unknown as SeedPack

beforeEach(() => {
  vi.clearAllMocks()
  loadBuiltInSeedPacks.mockResolvedValue([PACK])
})

describe('SeedPackStep (PHASE-37 37E)', () => {
  it('loads built-ins and shows the None option', async () => {
    render(<SeedPackStep selectedPack={null} onSelect={() => {}} />)
    expect(screen.getByText('No seed pack')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('The Hollowmere')).toBeTruthy())
  })

  it('warns on a system mismatch', () => {
    const alien = { ...PACK, system: 'pf2e' } as unknown as SeedPack
    render(<SeedPackStep selectedPack={alien} onSelect={() => {}} />)
    expect(screen.getByText(/pf2e/)).toBeTruthy()
  })
})
