import { useEffect, useState } from 'react'
import { logger } from '../utils/logger'

/**
 * Generic hook for loading equipment data on mount.
 * Eliminates duplication of the useState + useEffect + load pattern
 * found in OffenseSection5e, DefenseSection5e, EquipmentSection5e, CraftingSection5e.
 *
 * @param loader - Async function that returns the data
 * @param initial - Initial value before data loads
 */
export function useEquipmentData<T>(loader: () => Promise<T>, initial: T): T {
  const [data, setData] = useState<T>(initial)
  // Load ONCE on mount. `loader` is intentionally NOT a dependency: callers pass
  // an inline arrow (`() => load5eWeapons()`), which is a fresh reference every
  // render. Depending on it re-ran the effect → setData → re-render → new loader
  // → effect again → an unbounded async loop that froze the whole sheet (no
  // console error, because the setState is async so React's update-depth guard
  // never trips and the `.catch` swallows load failures). Equipment reference
  // data is static, so mount-once is correct. A `cancelled` flag guards against
  // setState after unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment — `loader` is deliberately excluded (load-once); including it causes an infinite render loop.
  useEffect(() => {
    let cancelled = false
    loader()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => logger.warn('[useEquipmentData] Failed to load equipment data', e))
    return () => {
      cancelled = true
    }
  }, [])
  return data
}
