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
