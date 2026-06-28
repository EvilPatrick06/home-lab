// Phase 28d — canonical home for the library reference types in the
// `Character5e` transitive type closure. These are type-only (no runtime), so
// they are safe to share across the main/renderer process boundary. The full
// `library.ts` in `src/renderer/src/types/` re-exports these and keeps its own
// runtime (LIBRARY_GROUPS, getCategoryDef, …) plus renderer-only types.

export interface BaseLibraryEntry {
  id: string
  name: string
  source?: string
  description?: string
  createdAt?: string
  updatedAt?: string
  pluginId?: string
}

export type LibraryEntry<_C extends string = string> = BaseLibraryEntry & Record<string, unknown>

export type DeepPartial<T> =
  T extends ReadonlyArray<infer _U> ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

export interface EntryRef<C extends string = string> {
  entryId: string
  entryType: C
  overrides?: DeepPartial<LibraryEntry<C>>
}

export type MergedEntry<C extends string = string> = LibraryEntry<C>
