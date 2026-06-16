// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PHASE-13 13H — deep-link (initialCategory/initialQuery) navigation + auto-select.

const h = vi.hoisted(() => ({
  homebrew: [] as unknown[],
  loadHomebrew: vi.fn(),
  favorites: [] as string[],
  toggleFavorite: vi.fn(),
  loadCategoryItems: vi.fn()
}))

vi.mock('../../../../services/library-service', () => ({ loadCategoryItems: h.loadCategoryItems }))
vi.mock('../../../../stores/use-library-store', () => ({
  useLibraryStore: () => ({ homebrewEntries: h.homebrew, loadHomebrew: h.loadHomebrew })
}))
vi.mock('../../../../stores/use-library-ui-store', () => ({
  useLibraryUiStore: () => ({ favorites: h.favorites, toggleFavorite: h.toggleFavorite })
}))
// Stub the heavy library list/detail components — we only care about which category the list
// renders and whether the detail modal opened (= an item was auto-selected).
vi.mock('../../../library', async () => {
  const React = await import('react')
  return {
    // biome-ignore lint/suspicious/noExplicitAny: test stub props
    LibraryItemList: (props: any) =>
      React.createElement(
        'div',
        { 'data-testid': 'item-list', 'data-category': props.category },
        // biome-ignore lint/suspicious/noExplicitAny: test stub props
        (props.items ?? []).map((i: any) => React.createElement('div', { key: i.id }, i.name))
      ),
    // biome-ignore lint/suspicious/noExplicitAny: test stub props
    LibraryDetailModal: (props: any) => React.createElement('div', { 'data-testid': 'detail' }, props.item.name)
  }
})

import type { LibraryCategory } from '../../../../types/library'
import CompendiumModal from './CompendiumModal'

beforeEach(() => {
  h.loadCategoryItems.mockReset()
  h.loadHomebrew.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('CompendiumModal deep-link (PHASE-13 13H)', () => {
  it('opens on the category tab and auto-selects the exact name match', async () => {
    h.loadCategoryItems.mockResolvedValue([
      { id: 's1', name: 'Fireball', category: 'spells' },
      { id: 's2', name: 'Ice Knife', category: 'spells' }
    ])
    render(<CompendiumModal onClose={vi.fn()} initialCategory="spells" initialQuery="Fireball" />)

    const detail = await screen.findByTestId('detail')
    expect(detail.textContent).toBe('Fireball')
    expect(screen.getByTestId('item-list').getAttribute('data-category')).toBe('spells')
  })

  it('falls back to search-seeding for a category without a tab (no auto-select)', async () => {
    h.loadCategoryItems.mockResolvedValue([{ id: 'a1', name: 'Dash', category: 'actions' }])
    const { container } = render(
      <CompendiumModal onClose={vi.fn()} initialCategory={'npcs' as LibraryCategory} initialQuery="Goblin" />
    )

    await waitFor(() => expect(screen.getByTestId('item-list')).toBeTruthy())
    expect(screen.getByTestId('item-list').getAttribute('data-category')).toBe('actions')
    expect(screen.queryByTestId('detail')).toBeNull()
    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement
    expect(searchInput.value).toBe('Goblin')
  })
})
