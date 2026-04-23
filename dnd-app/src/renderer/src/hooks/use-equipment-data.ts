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
  useEffect(() => {
    loader()
      .then(setData)
      .catch((e) => logger.warn('[useEquipmentData] Failed to load equipment data', e))
  }, [loader])
  return data
}
