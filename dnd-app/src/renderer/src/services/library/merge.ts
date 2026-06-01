function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Recursive object merge. Plain objects merge key-by-key; arrays replace
// atomically (per Phase 15 override contract — a customized list belongs to
// the player); primitives replace; `undefined` skips.
//
// `visited` guards against a self-referential override object (a runtime-
// introduced cycle): without it the recursion would never terminate and never
// throw — a silent hang. JSON can't carry cycles, so this is defense-in-depth.
// The default param keeps the public signature backward-compatible.
export function deepMergeObjects<T extends Record<string, unknown>>(
  base: T,
  overrides: Record<string, unknown> | undefined,
  visited: WeakSet<object> = new WeakSet()
): T {
  if (overrides === undefined) return base
  if (!isPlainObject(overrides)) return base
  if (visited.has(overrides)) return base
  visited.add(overrides)

  const out: Record<string, unknown> = { ...base }
  for (const [key, override] of Object.entries(overrides)) {
    if (override === undefined) continue
    const baseValue = out[key]
    if (isPlainObject(baseValue) && isPlainObject(override) && !visited.has(override)) {
      out[key] = deepMergeObjects(baseValue, override, visited)
    } else {
      out[key] = override
    }
  }
  return out as T
}
