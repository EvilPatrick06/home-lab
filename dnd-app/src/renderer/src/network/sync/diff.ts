import type { Delta } from './shard'

/**
 * Phase 31b — generic structural diff with reversible apply.
 *
 * `structuralDiff(prev, next)` returns `null` when deep-equal, a `replace` delta
 * for primitives / type changes / non-record arrays, an array patch for arrays of
 * `{ id }` records (carrying the next order so apply is order-exact), and an
 * object patch (per-key sub-deltas + deletions) for plain objects.
 *
 * Invariant (round-trip): `applyDelta(prev, structuralDiff(prev, next)!)` deep-
 * equals `next` whenever the diff is non-null.
 */

type Rec = Record<string, unknown>

interface ArrayPatch {
  type: 'array'
  added: unknown[]
  removed: string[]
  updated: Array<{ id: string; delta: Delta }>
  order: string[]
}
interface ObjectPatch {
  type: 'object'
  set: Record<string, Delta>
  deleted: string[]
}

function isPlainObject(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isRecordArray(v: unknown): v is Rec[] {
  return Array.isArray(v) && v.every((e) => isPlainObject(e) && (typeof e.id === 'string' || typeof e.id === 'number'))
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((x, i) => deepEqual(x, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    return ak.every((k) => deepEqual(a[k], b[k]))
  }
  return false
}

const replace = (value: unknown): Delta => ({ kind: 'replace', payload: value, sequence: 0 })

export function structuralDiff<T>(prev: T, next: T): Delta<T> | null {
  if (deepEqual(prev, next)) return null

  // Arrays of records → order-exact patch; other arrays → replace.
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (!isRecordArray(prev) || !isRecordArray(next)) return replace(next) as Delta<T>
    const prevById = new Map(prev.map((e) => [String(e.id), e]))
    const nextById = new Map(next.map((e) => [String(e.id), e]))
    const added: unknown[] = []
    const removed: string[] = []
    const updated: Array<{ id: string; delta: Delta }> = []
    for (const [id, val] of nextById) {
      if (!prevById.has(id)) added.push(val)
      else {
        const d = structuralDiff(prevById.get(id), val)
        if (d) updated.push({ id, delta: d })
      }
    }
    for (const id of prevById.keys()) if (!nextById.has(id)) removed.push(id)
    const patch: ArrayPatch = { type: 'array', added, removed, updated, order: next.map((e) => String(e.id)) }
    return { kind: 'patch', payload: patch, sequence: 0 }
  }

  // Plain objects → per-key patch.
  if (isPlainObject(prev) && isPlainObject(next)) {
    const set: Record<string, Delta> = {}
    const deleted: string[] = []
    for (const k of Object.keys(next)) {
      if (!(k in prev)) set[k] = replace(next[k])
      else {
        const d = structuralDiff(prev[k], next[k])
        if (d) set[k] = d
      }
    }
    for (const k of Object.keys(prev)) if (!(k in next)) deleted.push(k)
    const patch: ObjectPatch = { type: 'object', set, deleted }
    return { kind: 'patch', payload: patch, sequence: 0 }
  }

  // Primitive / type change.
  return replace(next) as Delta<T>
}

export function applyDelta<T>(target: T, delta: Delta): T {
  if (delta.kind === 'replace') return delta.payload as T

  const patch = delta.payload as ArrayPatch | ObjectPatch
  if (patch.type === 'array') {
    const byId = new Map<string, Rec>((target as unknown as Rec[]).map((e) => [String(e.id), e]))
    for (const id of patch.removed) byId.delete(id)
    for (const u of patch.updated) {
      const cur = byId.get(u.id)
      if (cur) byId.set(u.id, applyDelta(cur, u.delta))
    }
    for (const a of patch.added) byId.set(String((a as Rec).id), a as Rec)
    return patch.order.map((id) => byId.get(id)).filter((e): e is Rec => e !== undefined) as unknown as T
  }

  // object patch
  const out: Rec = { ...(target as unknown as Rec) }
  for (const [k, d] of Object.entries(patch.set)) out[k] = applyDelta(out[k], d)
  for (const k of patch.deleted) delete out[k]
  return out as unknown as T
}
