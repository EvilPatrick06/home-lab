// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBuilderStore } from '../../../stores/use-builder-store'
import { useLibraryStore } from '../../../stores/use-library-store'
import MulticlassLevelBar5e from './MulticlassLevelBar5e'

// Minimal class set primed directly into the library truth store so the
// component's useLibraryCategory('classes', ...) read resolves synchronously
// (no network / window.api.game.loadJson needed in the test environment).
const CLASSES = [
  { id: 'wizard', name: 'Wizard' },
  { id: 'cleric', name: 'Cleric' },
  { id: 'fighter', name: 'Fighter' }
]

beforeEach(() => {
  vi.stubGlobal('window', { ...globalThis.window, api: { storage: {}, game: {} } })
  useBuilderStore.getState().resetBuilder()
  useLibraryStore.setState((s) => ({
    entries: { ...s.entries, classes: Object.fromEntries(CLASSES.map((c) => [c.id, c])) },
    loaded: { ...s.loaded, classes: true },
    cacheMeta: { ...s.cacheMeta, classes: { loadedAt: Date.now(), loading: false } }
  }))
})

/** Set up a level-10 Wizard primary with multiclass-eligible (all-15) scores. */
function setupWizardL10(): void {
  const store = useBuilderStore
  store.getState().selectGameSystem('dnd5e')
  const slots = store
    .getState()
    .buildSlots.map((s) => (s.category === 'class' ? { ...s, selectedId: 'wizard', selectedName: 'Wizard' } : s))
  store.setState({
    buildSlots: slots,
    abilityScores: {
      strength: 15,
      dexterity: 15,
      constitution: 15,
      intelligence: 15,
      wisdom: 15,
      charisma: 15
    }
  })
  store.getState().setTargetLevel(10)
}

describe('MulticlassLevelBar5e', () => {
  it('can be imported', async () => {
    const mod = await import('./MulticlassLevelBar5e')
    expect(mod).toBeDefined()
  })

  it('renders one editable dropdown per level above 1 (level 1 is fixed primary)', () => {
    setupWizardL10()
    render(<MulticlassLevelBar5e />)
    // Levels 2..10 -> 9 selects; level 1 is a static label, not a <select>.
    expect(screen.getAllByRole('combobox')).toHaveLength(9)
  })

  it('commits a per-level class change to the store and recomputes build slots', () => {
    setupWizardL10()
    const store = useBuilderStore
    render(<MulticlassLevelBar5e />)

    const lvl2 = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(lvl2.value).toBe('wizard') // defaults to primary before any choice

    fireEvent.change(lvl2, { target: { value: 'cleric' } })

    // 1) The multiclass choice persists.
    expect(store.getState().classLevelChoices[2]).toBe('cleric')
    // 2) The displayed control reflects the new selection (does NOT stay 'wizard').
    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('cleric')
    // 3) Derived state recomputes: build slots regenerate to include the cleric
    //    level-2 feature slot, so HP/features/spell slots flow from the new class.
    expect(store.getState().buildSlots.some((s) => s.id.includes('cleric'))).toBe(true)
  })
})
