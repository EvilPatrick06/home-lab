function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Recursive object merge. Plain objects merge key-by-key; arrays replace
// atomically (per Phase 15 override contract — a customized list belongs to
// the player); primitives replace; `undefined` skips.
export function deepMergeObjects<T extends Record<string, unknown>>(
  base: T,
  overrides: Record<string, unknown> | undefined
): T {
  if (overrides === undefined) return base
  if (!isPlainObject(overrides)) return base

  const out: Record<string, unknown> = { ...base }
  for (const [key, override] of Object.entries(overrides)) {
    if (override === undefined) continue
    const baseValue = out[key]
    if (isPlainObject(baseValue) && isPlainObject(override)) {
      out[key] = deepMergeObjects(baseValue, override)
    } else {
      out[key] = override
    }
  }
  return out as T
}
