import { afterEach, describe, expect, it } from 'vitest'
import { useLibraryStore } from '../../stores/use-library-store'
import { deepMergeObjects } from './merge'
import * as hooksModule from './use-library-entry'

afterEach(() => {
  useLibraryStore.getState().clearAll()
})

// The hooks themselves are thin wrappers around useLibraryStore selectors;
// React-level rendering needs @testing-library/react which isn't installed
// in this repo today. Until then, these specs exercise the underlying
// store-side behavior the hooks rely on, plus verify module exports.

describe('use-library-entry module', () => {
  it('exports the three hook factories', () => {
    expect(typeof hooksModule.useLibraryEntry).toBe('function')
    expect(typeof hooksModule.useLibraryEntries).toBe('function')
    expect(typeof hooksModule.useHydratedRef).toBe('function')
  })
})

describe('useLibraryStore read path (what useLibraryEntry consumes)', () => {
  it('selector returns null when category is empty', () => {
    const state = useLibraryStore.getState()
    expect(state.entries.spells?.['fireball'] ?? null).toBeNull()
  })

  it('selector returns the entry once loaded', async () => {
    await useLibraryStore.getState().loadCategory('spells', () => [{ id: 'fireball', name: 'Fireball', level: 3 }])
    const state = useLibraryStore.getState()
    expect((state.entries.spells?.['fireball'] as { name: string })?.name).toBe('Fireball')
  })

  it('selector picks up a homebrew upsert mutation', async () => {
    await useLibraryStore.getState().loadCategory('spells', () => [{ id: 'fireball', name: 'Fireball', level: 3 }])
    useLibraryStore.getState().upsertHomebrew('spells', { id: 'fireball', name: 'Fireball (rebalanced)', level: 3 })
    const entry = useLibraryStore.getState().entries.spells?.['fireball'] as { name: string }
    expect(entry.name).toBe('Fireball (rebalanced)')
  })
})

describe('useLibraryStore filter path (what useLibraryEntries consumes)', () => {
  it('returns [] when category is empty', () => {
    expect(useLibraryStore.getState().getEntries('feats')).toEqual([])
  })

  it('returns every entry with no filter', async () => {
    await useLibraryStore.getState().loadCategory('feats', () => [
      { id: 'great-weapon-master', name: 'Great Weapon Master' },
      { id: 'sharpshooter', name: 'Sharpshooter' }
    ])
    expect(useLibraryStore.getState().getEntries('feats').length).toBe(2)
  })

  it('applies a filter', async () => {
    await useLibraryStore.getState().loadCategory('feats', () => [
      { id: 'great-weapon-master', name: 'Great Weapon Master' },
      { id: 'sharpshooter', name: 'Sharpshooter' }
    ])
    const onlyWeapon = useLibraryStore.getState().getEntries('feats', (f) => f.name.includes('Weapon'))
    expect(onlyWeapon.length).toBe(1)
    expect(onlyWeapon[0].name).toBe('Great Weapon Master')
  })
})

describe('useHydratedRef merge path (the deepMergeObjects integration)', () => {
  it('orphan ref → null lookup', () => {
    const ref = { entryType: 'spells' as const, entryId: 'missing' }
    const entry = useLibraryStore.getState().entries.spells?.[ref.entryId] ?? null
    expect(entry).toBeNull()
  })

  it('no overrides → entry returned unchanged', async () => {
    await useLibraryStore
      .getState()
      .loadCategory('magic-items', () => [{ id: 'wand', name: 'Wand of Magic Missiles', requiresAttunement: true }])
    const ref = { entryType: 'magic-items' as const, entryId: 'wand' }
    const entry = useLibraryStore.getState().entries['magic-items']?.[ref.entryId]
    expect(entry?.name).toBe('Wand of Magic Missiles')
  })

  it('primitive-field override replaces base value', () => {
    const entry = { id: 'wand', name: 'Wand of Magic Missiles', requiresAttunement: true }
    const merged = deepMergeObjects(entry as Record<string, unknown>, { name: 'Pew Pew' })
    expect(merged.name).toBe('Pew Pew')
    expect(merged.requiresAttunement).toBe(true)
  })

  it('nested-object override deep-merges', () => {
    const entry = { id: 'fireball', name: 'Fireball', level: 3, damage: { base: '8d6', type: 'fire' } }
    const merged = deepMergeObjects(entry as Record<string, unknown>, { damage: { base: '10d6' } })
    expect(merged.damage).toEqual({ base: '10d6', type: 'fire' })
  })

  it('array override replaces atomically', () => {
    const entry = { id: 'monster', name: 'Goblin', actions: ['bite', 'kick'] }
    const merged = deepMergeObjects(entry as Record<string, unknown>, { actions: ['stab'] })
    expect(merged.actions).toEqual(['stab'])
  })
})
