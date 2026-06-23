// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SpellPicker5e from './SpellPicker5e'
import type { SpellData } from './SpellSummary5e'

const spells: SpellData[] = [
  { id: 'fire-bolt', name: 'Fire Bolt', level: 0 },
  { id: 'mage-armor', name: 'Mage Armor', level: 1 },
  { id: 'shield', name: 'Shield', level: 1 }
]

describe('SpellPicker5e (PHASE-48 F2 memo contract)', () => {
  it('lists the available spells', () => {
    render(<SpellPicker5e availableSpells={spells} selectedSpellIds={[]} toggleSpell={vi.fn()} />)
    expect(screen.getByText('Fire Bolt')).toBeTruthy()
    expect(screen.getByText('Mage Armor')).toBeTruthy()
  })

  it('calls the stable toggleSpell with the spell id when a checkbox is clicked', () => {
    const toggleSpell = vi.fn()
    render(<SpellPicker5e availableSpells={spells} selectedSpellIds={[]} toggleSpell={toggleSpell} />)
    // The first button in a SpellRow is the checkbox toggle.
    const fireBoltRow = screen.getByText('Fire Bolt').closest('div.border-b') as HTMLElement
    const checkbox = fireBoltRow.querySelector('button') as HTMLButtonElement
    fireEvent.click(checkbox)
    expect(toggleSpell).toHaveBeenCalledWith('fire-bolt')
  })
})
