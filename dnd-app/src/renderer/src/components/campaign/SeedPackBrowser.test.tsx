// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SeedPack } from '../../services/seed-packs/seed-pack-schema'
import SeedPackBrowser from './SeedPackBrowser'

const PACK = {
  format: 'dnd-vtt-seed-pack',
  formatVersion: 1,
  id: 'hollowmere',
  name: 'The Hollowmere',
  description: 'A gothic fen',
  system: 'dnd5e',
  levelRange: { min: 1, max: 4 },
  tags: ['gothic'],
  lore: [
    { id: 'l1', title: 'A', content: 'x', category: 'world' },
    { id: 'l2', title: 'B', content: 'y', category: 'world' }
  ],
  npcs: [{ id: 'n1', name: 'Maren', description: 'd' }],
  quests: [{ name: 'Q', description: '', objectives: [], chapterQuest: true }]
} as unknown as SeedPack

describe('SeedPackBrowser (PHASE-37 37E)', () => {
  it('renders a pack card with name + counts', () => {
    render(<SeedPackBrowser packs={[PACK]} selectedId={null} onSelect={() => {}} onImportFile={() => {}} />)
    expect(screen.getByText('The Hollowmere')).toBeTruthy()
    expect(screen.getByText(/2 lore/)).toBeTruthy()
    expect(screen.getByText(/1 NPCs/)).toBeTruthy()
  })

  it('fires onSelect when a card is clicked', () => {
    const onSelect = vi.fn()
    render(<SeedPackBrowser packs={[PACK]} selectedId={null} onSelect={onSelect} onImportFile={() => {}} />)
    fireEvent.click(screen.getByText('The Hollowmere'))
    expect(onSelect).toHaveBeenCalledWith(PACK)
  })

  it('fires onImportFile from the import button', () => {
    const onImport = vi.fn()
    render(<SeedPackBrowser packs={[PACK]} selectedId={null} onSelect={() => {}} onImportFile={onImport} />)
    fireEvent.click(screen.getByText(/Import from file/))
    expect(onImport).toHaveBeenCalled()
  })

  it('shows the expanded preview (quest names) for the selected pack', () => {
    render(<SeedPackBrowser packs={[PACK]} selectedId="hollowmere" onSelect={() => {}} onImportFile={() => {}} />)
    expect(screen.getByText(/Q/)).toBeTruthy()
  })
})
