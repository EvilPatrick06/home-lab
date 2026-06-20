// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LibraryCategoryGrid from './LibraryCategoryGrid'

// PHASE-13 13J — the grid renders official counts (totalCounts) and homebrew counts
// (itemCounts) per category; both treat 0/undefined gracefully (no count chip).

describe('LibraryCategoryGrid counts (PHASE-13 13J)', () => {
  it('renders the official item count from totalCounts', () => {
    render(<LibraryCategoryGrid onSelectCategory={vi.fn()} itemCounts={{}} totalCounts={{ spells: 319 }} />)
    expect(screen.getByText(/319 items/)).toBeTruthy()
  })

  it('uses the singular noun for a count of 1 (no "1 items")', () => {
    render(<LibraryCategoryGrid onSelectCategory={vi.fn()} itemCounts={{}} totalCounts={{ spells: 1 }} />)
    expect(screen.getByText(/\b1 item\b/)).toBeTruthy()
    expect(screen.queryByText(/1 items/)).toBeNull()
  })

  it('renders official + homebrew counts together', () => {
    render(<LibraryCategoryGrid onSelectCategory={vi.fn()} itemCounts={{ spells: 4 }} totalCounts={{ spells: 319 }} />)
    expect(screen.getByText(/319 items · 4 custom/)).toBeTruthy()
  })

  it('shows no count chip when both are zero/absent', () => {
    render(<LibraryCategoryGrid onSelectCategory={vi.fn()} itemCounts={{}} totalCounts={{}} />)
    expect(screen.queryByText(/items/)).toBeNull()
  })
})
