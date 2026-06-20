// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BuildSlot } from '../../../types/character-common'

// Load the REAL library subclass data so the test guards against the actual
// data shape (lowercase `class` field, no `className`). Regression target:
// the filter must tolerate `class` OR it shows "No subclasses found".
const realSubclasses = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/data/5e/character/subclasses.json'), 'utf-8')
)

vi.mock('../../../services/data-provider', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, load5eSubclasses: vi.fn(async () => realSubclasses) }
})

vi.mock('../../../stores/use-level-up-store', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test selector stub
  useLevelUpStore: (sel: any) => sel({ setSlotSelection: vi.fn() })
}))

import { SubclassSelector5e } from './SubclassSelector5e'

const slot: BuildSlot = {
  id: 's1',
  label: 'Subclass',
  category: 'class-feat',
  level: 3,
  selectedId: null,
  selectedName: null,
  required: true
}

// Every 2024 PHB class chooses its subclass at level 3; each must offer >=1.
const CLASSES = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard'
] as const

describe('SubclassSelector5e', () => {
  it('lists the four 2024 Wizard subclasses (regression: class vs className key)', async () => {
    render(<SubclassSelector5e slot={slot} classId="wizard" />)
    fireEvent.click(screen.getByText(/Select/i))
    await waitFor(() => expect(screen.getByText('Abjurer')).toBeTruthy())
    expect(screen.getByText('Diviner')).toBeTruthy()
    expect(screen.getByText('Evoker')).toBeTruthy()
    expect(screen.getByText('Illusionist')).toBeTruthy()
    expect(screen.queryByText(/No subclasses found/i)).toBeNull()
  })

  it.each(CLASSES)('shows a non-empty subclass list for %s (not the empty message)', async (classId) => {
    render(<SubclassSelector5e slot={slot} classId={classId} />)
    fireEvent.click(screen.getByText(/Select/i))
    // Once loading resolves, the empty-state message must NOT appear for any class.
    await waitFor(() => {
      expect(screen.queryByText(/No subclasses found/i)).toBeNull()
    })
  })
})
