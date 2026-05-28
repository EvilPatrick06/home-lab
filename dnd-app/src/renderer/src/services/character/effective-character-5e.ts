import { useLibraryStore } from '../../stores/use-library-store'
import type { Character5e, CharacterClass5e, MagicItemEntry5e } from '../../types/character-5e'
import type { ActiveCondition, ArmorEntry, SpellEntry, WeaponEntry } from '../../types/character-common'
import { deepMergeObjects } from '../library/merge'

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
      hitDie: ((entry?.hitDie as number) ??
        ((entry?.coreTraits as Record<string, unknown> | undefined)?.hitPointDie as unknown as number) ??
        10) as number
    }
  })
}

export function getEffectiveKnownSpells(character: Character5e): SpellEntry[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
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
  const hydrated = hydrate(character.weaponRefs, entries.weapons) as unknown as WeaponEntry[]
  // Attach instance-state `equipped` from state.weaponEquipped if present.
  const equippedMap = character.state?.weaponEquipped
  if (!equippedMap) return hydrated
  return hydrated.map((w) => {
    const instanceId = (w as unknown as { __instanceId: string }).__instanceId
    return { ...w, equipped: equippedMap[instanceId] === true } as WeaponEntry
  })
}

export function getEffectiveArmor(character: Character5e): ArmorEntry[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  const hydrated = hydrate(character.armorRefs, entries.armor) as unknown as ArmorEntry[]
  const equippedMap = character.state?.armorEquipped
  if (!equippedMap) return hydrated
  return hydrated.map((a) => {
    const instanceId = (a as unknown as { __instanceId: string }).__instanceId
    return { ...a, equipped: equippedMap[instanceId] === true } as ArmorEntry
  })
}

export function getEffectiveMagicItems(character: Character5e): MagicItemEntry5e[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  const hydrated = hydrate(character.magicItemRefs, entries['magic-items']) as unknown as MagicItemEntry5e[]
  const attunedMap = character.state?.magicItemAttuned
  const chargesMap = character.state?.magicItemCharges
  if (!attunedMap && !chargesMap) return hydrated
  return hydrated.map((m) => {
    const instanceId = (m as unknown as { __instanceId: string }).__instanceId
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

export function getEffectiveFeats(
  character: Character5e
): Array<{ id: string; name: string; description: string; choices?: Record<string, string | string[]> }> {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  return hydrate(character.featRefs, entries.feats) as unknown as Array<{
    id: string
    name: string
    description: string
    choices?: Record<string, string | string[]>
  }>
}

export function getEffectiveConditions(character: Character5e): ActiveCondition[] {
  const entries = useLibraryStore.getState().entries as LibraryEntries
  const hydrated = hydrate(character.conditionRefs, entries.conditions) as unknown as Array<{
    name: string
    description?: string
  }>
  return hydrated.map((c) => ({ name: c.name, type: 'condition' as const, isCustom: false }))
}
