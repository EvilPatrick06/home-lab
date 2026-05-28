import { useEffect, useMemo } from 'react'
import { useLibraryStore } from '../../stores/use-library-store'
import type { EntryRef, LibraryCategory, LibraryEntry, MergedEntry } from '../../types/library'
import { deepMergeObjects } from './merge'

// useLibraryEntry — read a single library entry by category + id. Returns null
// when the entry is not loaded yet (bootstrap), has been deleted, or has been
// re-classified to another category. Consumers MUST handle null.
export function useLibraryEntry<C extends LibraryCategory>(
  category: C,
  id: string | null | undefined
): LibraryEntry<C> | null {
  return useLibraryStore((s) => {
    if (!id) return null
    return (s.entries[category]?.[id] ?? null) as LibraryEntry<C> | null
  })
}

// useLibraryEntries — read every entry in a category, optional filter. Returns
// [] when no entries are loaded; the filter is applied after retrieval.
export function useLibraryEntries<C extends LibraryCategory>(
  category: C,
  filter?: (entry: LibraryEntry<C>) => boolean
): LibraryEntry<C>[] {
  const bucket = useLibraryStore((s) => s.entries[category])
  return useMemo(() => {
    if (!bucket) return []
    const all = Object.values(bucket) as LibraryEntry<C>[]
    return filter ? all.filter(filter) : all
  }, [bucket, filter])
}

// useLibraryCategory — combine `loadCategory` bootstrap + `useLibraryEntries`
// read into a single hook. Each React consumer that previously did
// `useEffect(() => load5eX().then(setX), [])` becomes
// `const entries = useLibraryCategory('x', load5eX)`. The loader is called
// once per mount; the truth store's TTL cache + waiter coalescing dedupe
// concurrent callers and skip work after the first successful load.
export function useLibraryCategory<C extends LibraryCategory>(
  category: C,
  loader: () => Promise<unknown[]>
): LibraryEntry<C>[] {
  const entries = useLibraryEntries(category)
  useEffect(() => {
    useLibraryStore.getState().loadCategory(category, async () => (await loader()) as unknown as LibraryEntry[])
  }, [category, loader])
  return entries
}

// useHydratedInstances — hydrate an array of InstanceRef<C> into entries merged
// with their per-instance overrides. Each result item carries the
// `__instanceId` so consumers can key state lookups (state.preparedSpellIds,
// state.magicItemAttuned, …) against it. Orphan refs (entries not present in
// the truth store) are filtered out — consumers handle empty lists.
export function useHydratedInstances<C extends LibraryCategory>(
  refs: Array<{ instanceId: string; ref: EntryRef<C> }> | undefined,
  category: C
): Array<LibraryEntry<C> & { __instanceId: string }> {
  const bucket = useLibraryStore((s) => s.entries[category])
  return useMemo(() => {
    if (!refs || refs.length === 0) return []
    const out: Array<LibraryEntry<C> & { __instanceId: string }> = []
    for (const instance of refs) {
      const entry = bucket?.[instance.ref.entryId]
      if (!entry) continue
      const merged = instance.ref.overrides
        ? (deepMergeObjects(
            entry as Record<string, unknown>,
            instance.ref.overrides as Record<string, unknown>
          ) as LibraryEntry<C>)
        : (entry as LibraryEntry<C>)
      out.push({ ...merged, __instanceId: instance.instanceId })
    }
    return out
  }, [refs, bucket])
}

// useHydratedClassList — convert v4 classRefs back into the v3 CharacterClass5e
// shape so consumers that read `character.classes` for display/derivation
// stay compatible. Returns an empty array when classRefs is absent.
export function useHydratedClassList(
  classRefs:
    | Array<{
        instanceId: string
        ref: EntryRef<'classes'>
        level: number
        levelTaken?: number
        subclassRef?: EntryRef<'subclasses'> | null
      }>
    | undefined
): Array<{ name: string; level: number; subclass?: string; hitDie: number }> {
  const bucket = useLibraryStore((s) => s.entries.classes)
  return useMemo(() => {
    if (!classRefs || classRefs.length === 0) return []
    return classRefs.map((cr) => {
      const entry = bucket?.[cr.ref.entryId] as Record<string, unknown> | undefined
      return {
        name: (entry?.name as string) ?? cr.ref.entryId,
        level: cr.level,
        subclass: cr.subclassRef?.entryId,
        hitDie:
          (entry?.hitDie as number) ??
          ((entry?.coreTraits as Record<string, unknown> | undefined)?.hitPointDie as unknown as number) ??
          10
      }
    })
  }, [classRefs, bucket])
}

// useHydratedRef — resolve an EntryRef to its live entry merged with overrides
// per Phase 15 override-merge semantics (plain objects merge, arrays replace
// atomically, primitives replace, undefined skips). Returns null when the
// referenced entry doesn't exist (orphan, bootstrap, re-classified).
export function useHydratedRef<C extends LibraryCategory>(ref: EntryRef<C> | null | undefined): MergedEntry<C> | null {
  const entry = useLibraryStore((s) => {
    if (!ref) return null
    return (s.entries[ref.entryType]?.[ref.entryId] ?? null) as LibraryEntry<C> | null
  })
  return useMemo(() => {
    if (!entry) return null
    if (!ref?.overrides) return entry as MergedEntry<C>
    return deepMergeObjects(
      entry as Record<string, unknown>,
      ref.overrides as Record<string, unknown>
    ) as MergedEntry<C>
  }, [entry, ref?.overrides])
}
