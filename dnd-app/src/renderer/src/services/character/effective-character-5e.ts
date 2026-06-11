import { useLibraryStore } from '../../stores/use-library-store'
import type { Character5e, CharacterClass5e, MagicItemEntry5e } from '../../types/character-5e'
import type { ActiveCondition, ArmorEntry, SpellEntry, WeaponEntry } from '../../types/character-common'
import { deepMergeObjects } from '../library/merge'
import type { HomebrewFeatEffect } from './homebrew-effects'

// Phase 15c.5 — v3-shape derivation from v4 Character5e refs + state.
//
// `Character5e` no longer carries the inline arrays (`classes`, `knownSpells`,
// `preparedSpellIds`, `weapons`, `armor`, `magicItems`, `feats`, `conditions`).
// Components / services that still read those shapes use these helpers to
// derive v3-shaped views on demand. Hydration pulls from the truth store
// (`useLibraryStore`), so library mutations propagate through the derivation.
//
// Sync helpers (`getEffective*`) read `useLibraryStore.getState()` — usable
// from anywhere (services, slices, calculators, event handlers). Components
// can also subscribe via `useLibraryStore`-backed selectors if they need
// reactivity beyond the initial render.

type LibraryEntries = Partial<Record<string, Record<string, Record<string, unknown>>>>

function hydrate<C extends string>(
  refs:
    | Array<{ instanceId: string; ref: { entryType: C; entryId: string; overrides?: Record<string, unknown> } }>
    | undefined,
  bucket: Record<string, Record<string, unknown>> | undefined
): Array<Record<string, unknown> & { __instanceId: string }> {
  if (!refs) return []
  const out: Array<Record<string, unknown> & { __instanceId: string }> = []
  for (const inst of refs) {
    const entry = bucket?.[inst.ref.entryId]
    const overrides = inst.ref.overrides as Record<string, unknown> | undefined
    let merged: Record<string, unknown>
    if (entry) {
      merged = overrides ? deepMergeObjects(entry, overrides) : entry
    } else if (overrides) {
      // Orphan / custom entry not present in the library — the ref carries the
      // full object as overrides. Hydrate from those alone.
      merged = overrides
    } else {
      continue
    }
    out.push({ ...merged, __instanceId: inst.instanceId })
  }
  return out
}

/**
 * Resolve a class entry's hit die to a number. Class data stores it as
 * `coreTraits.hitPointDie` = a string like `"D12"` (see public/data/5e/classes),
 * so it must be PARSED — the same `parseInt(...replace(/\D/g,''))` the builder and
 * level-up use. The old `(coreTraits.hitPointDie as number)` cast was a compile-time
 * no-op that left a string (or fell through to 10), which is what made the print
 * sheet show the wrong die. Order: explicit numeric `hitDie` → parsed `hitPointDie`
 * (number or string) → 10.
 */
function resolveClassHitDie(entry: Record<string, unknown> | undefined): number {
  if (typeof entry?.hitDie === 'number' && entry.hitDie > 0) return entry.hitDie
  const raw = (entry?.coreTraits as Record<string, unknown> | undefined)?.hitPointDie
  if (typeof raw === 'number' && raw > 0) return raw
  if (typeof raw === 'string') {
    const n = Number.parseInt(raw.replace(/\D/g, ''), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 10
}

export function getEffectiveClasses(character: Character5e): CharacterClass5e[] {
  if (!character.classRefs || character.classRefs.length === 0) return []
  const bucket = useLibraryStore.getState().entries.classes as Record<string, Record<string, unknown>> | undefined
  return character.classRefs.map((cr) => {
    // Orphan / custom / test fallback: ref.overrides carries the entry when the
    // library doesn't (or isn't loaded).
    const entry = bucket?.[cr.ref.entryId] ?? (cr.ref.overrides as Record<string, unknown> | undefined)
    return {
      name: ((entry?.name as string) ?? cr.ref.entryId) as string,
      level: cr.level,
      subclass: cr.subclassRef?.entryId,
      hitDie: resolveClassHitDie(entry)
    }
  })
}

export function getEffectiveKnownSpells(character: Character5e): SpellEntry[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  // boundary cast: untyped library hydration → concrete entry shape
  return hydrate(character.knownSpellRefs, entries.spells) as unknown as SpellEntry[]
}

export function getEffectivePreparedSpellIds(character: Character5e): string[] {
  const stateMap = character.state?.preparedSpellIds
  if (!stateMap || !character.knownSpellRefs) return []
  const idByInstance = new Map(character.knownSpellRefs.map((r) => [r.instanceId, r.ref.entryId]))
  const out: string[] = []
  for (const [instanceId, prepared] of Object.entries(stateMap)) {
    const id = idByInstance.get(instanceId)
    if (prepared && id) out.push(id)
  }
  return out
}

export function getEffectiveWeapons(character: Character5e): WeaponEntry[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  // Cast once to the entry shape (untyped library hydration) while preserving the
  // synthetic `__instanceId` so the id read below stays typed.
  const hydrated = hydrate(character.weaponRefs, entries.weapons) as unknown as Array<
    WeaponEntry & { __instanceId: string }
  >
  // Attach instance-state `equipped` from state.weaponEquipped if present.
  const equippedMap = character.state?.weaponEquipped
  if (!equippedMap) return hydrated
  return hydrated.map((w) => ({ ...w, equipped: equippedMap[w.__instanceId] === true }))
}

export function getEffectiveArmor(character: Character5e): ArmorEntry[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  const hydrated = hydrate(character.armorRefs, entries.armor) as unknown as Array<
    ArmorEntry & { __instanceId: string }
  >
  const equippedMap = character.state?.armorEquipped
  if (!equippedMap) return hydrated
  return hydrated.map((a) => ({ ...a, equipped: equippedMap[a.__instanceId] === true }))
}

export function getEffectiveMagicItems(character: Character5e): MagicItemEntry5e[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  // Cast once to the entry shape (untyped library hydration) while preserving the
  // synthetic `__instanceId` so the id read below stays typed.
  const hydrated = hydrate(character.magicItemRefs, entries['magic-items']) as unknown as Array<
    MagicItemEntry5e & { __instanceId: string }
  >
  const attunedMap = character.state?.magicItemAttuned
  const chargesMap = character.state?.magicItemCharges
  if (!attunedMap && !chargesMap) return hydrated
  return hydrated.map((m) => {
    const instanceId = m.__instanceId
    return {
      ...m,
      attuned: attunedMap?.[instanceId] === true,
      charges:
        chargesMap?.[instanceId] !== undefined
          ? { ...(m.charges ?? { max: 0, rechargeType: 'none' as const }), current: chargesMap[instanceId] }
          : m.charges
    } as MagicItemEntry5e
  })
}

export function getEffectiveFeats(character: Character5e): Array<{
  id: string
  name: string
  description: string
  choices?: Record<string, string | string[]>
  // Phase 25b — homebrew feats may carry a source marker + structured effects.
  source?: string
  effects?: HomebrewFeatEffect[]
}> {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  // boundary cast: untyped library hydration → concrete entry shape
  return hydrate(character.featRefs, entries.feats) as unknown as Array<{
    id: string
    name: string
    description: string
    choices?: Record<string, string | string[]>
    source?: string
    effects?: HomebrewFeatEffect[]
  }>
}

export function getEffectiveConditions(character: Character5e): ActiveCondition[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  // boundary cast: untyped library hydration → concrete entry shape. The instance's
  // own metadata rides in ref.overrides (PHASE-02 02A), so value/duration/custom
  // conditions survive even when the library has no matching entry (hydrate's
  // overrides-merge + orphan branch).
  const hydrated = hydrate(character.conditionRefs, entries.conditions) as unknown as Array<{
    name: string
    type?: string
    isCustom?: boolean
    value?: number
    duration?: number
  }>
  return hydrated.map((c) => ({
    name: c.name,
    type: (c.type ?? 'condition') as ActiveCondition['type'],
    isCustom: c.isCustom ?? false,
    ...(c.value !== undefined ? { value: c.value } : {}),
    ...(c.duration !== undefined ? { duration: c.duration } : {})
  }))
}
