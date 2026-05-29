/**
 * Phase 31a — shard interface for the live-state sync overhaul.
 *
 * A `Shard<T>` owns one slice of synchronized game state. The host-side
 * broadcaster (31c) subscribes to each shard, diffs successive values, and ships
 * `Delta`s; the client-side applier (31d) applies them. Bespoke per-feature
 * broadcasters get migrated onto this contract in 31e+.
 */

export interface Delta<TValue = unknown> {
  kind: 'replace' | 'patch'
  /** For `replace`: the whole new value. For `patch`: a structural patch object. */
  payload: TValue | unknown
  /** Monotonic per-shard sequence number, assigned by the broadcaster. */
  sequence: number
}

export interface Shard<TValue = unknown> {
  /** Stable shard name (wire key). */
  name: string
  /** Read the current value. */
  read: () => TValue
  /** Subscribe to local changes; returns an unsubscribe fn. */
  onChange: (cb: (value: TValue) => void) => () => void
  /** Compute a delta from prev→next (null when unchanged). */
  diff: (prev: TValue, next: TValue) => Delta<TValue> | null
  /** Apply a received delta to the local store. */
  applyDelta: (delta: Delta<TValue>) => void
  /** Optional per-recipient filter for permission-aware sync (31j). */
  permissionFilter?: (value: TValue, recipientClientId: string) => TValue
}
