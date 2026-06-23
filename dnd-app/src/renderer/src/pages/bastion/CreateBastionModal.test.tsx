// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Character } from '../../types/character'
import { CreateBastionModal } from './CreateBastionModal'

function setup(characters: Character[]) {
  return render(
    <MemoryRouter>
      <CreateBastionModal
        open
        onClose={vi.fn()}
        characters={characters}
        saveBastion={vi.fn()}
        setSelectedBastionId={vi.fn()}
      />
    </MemoryRouter>
  )
}

describe('CreateBastionModal empty-state CTA (PHASE-48 F4)', () => {
  it('shows a "create a character" CTA and no owner dropdown when there are no characters', () => {
    setup([])
    expect(screen.getByText(/create a character/i)).toBeTruthy()
    expect(screen.queryByText(/select a character/i)).toBeNull()
  })

  it('shows the owner dropdown (no CTA) when characters exist', () => {
    setup([{ id: 'c1', name: 'Aria', level: 3 } as unknown as Character])
    expect(screen.getByText(/select a character/i)).toBeTruthy()
    expect(screen.queryByText(/^create a character$/i)).toBeNull()
  })
})
