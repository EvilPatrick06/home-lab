// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Campaign, LoreEntry } from '../../types/campaign'
import LoreManager from './LoreManager'

vi.mock('../../hooks/use-toast', () => ({ addToast: vi.fn() }))

function makeCampaign(lore: LoreEntry[] = []): Campaign {
  return { id: 'c1', name: 'Test', lore, createdAt: '', updatedAt: '' } as unknown as Campaign
}

describe('LoreManager', () => {
  it('can be imported', async () => {
    const mod = await import('./LoreManager')
    expect(mod).toBeDefined()
  })
})

describe('LoreManager keywords (PHASE-25 25D)', () => {
  it('renders keyword chips for an entry that has them', () => {
    const c = makeCampaign([
      {
        id: 'l1',
        title: 'The Veil',
        content: 'a cult',
        category: 'faction',
        isVisibleToPlayers: false,
        createdAt: '',
        keywords: ['ashen veil', 'cult']
      }
    ])
    render(<LoreManager campaign={c} saveCampaign={vi.fn()} />)
    expect(screen.getByText('ashen veil')).toBeTruthy()
    expect(screen.getByText('cult')).toBeTruthy()
  })

  it('parses comma-separated keywords into a deduped array on save', async () => {
    const saveCampaign = vi.fn().mockResolvedValue(undefined)
    render(<LoreManager campaign={makeCampaign()} saveCampaign={saveCampaign} />)
    fireEvent.click(screen.getByText('+ Add Lore'))
    fireEvent.change(screen.getByPlaceholderText('Lore title'), { target: { value: 'New Lore' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. ashen veil, the veil, cult'), {
      target: { value: 'veil, cult, veil,  ' }
    })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => expect(saveCampaign).toHaveBeenCalled())
    const saved = saveCampaign.mock.calls[0][0] as Campaign
    expect(saved.lore?.[0].keywords).toEqual(['veil', 'cult']) // deduped, empties dropped
  })

  it('leaves a keyword-less entry shape-stable (no keywords key) after editing', async () => {
    const saveCampaign = vi.fn().mockResolvedValue(undefined)
    const c = makeCampaign([
      { id: 'l1', title: 'Plain', content: 'x', category: 'world', isVisibleToPlayers: false, createdAt: '2026-01-01' }
    ])
    render(<LoreManager campaign={c} saveCampaign={saveCampaign} />)
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(saveCampaign).toHaveBeenCalled())
    const saved = saveCampaign.mock.calls[0][0] as Campaign
    expect('keywords' in (saved.lore?.[0] as object)).toBe(false)
  })
})
