import { addToast } from '../hooks/use-toast'
import { load5eWearableItems } from '../services/data-provider'
import { logger } from '../utils/logger'

export const WEARABLE_ITEM_NAMES = new Set<string>()

load5eWearableItems()
  .then((items) => {
    for (const item of items) {
      WEARABLE_ITEM_NAMES.add(item)
    }
  })
  .catch((err) => {
    logger.error('Failed to load wearable items', err)
    addToast('Failed to load wearable items', 'error')
  })

export function isWearableItem(name: string): boolean {
  const lower = name.toLowerCase()
  for (const wearable of WEARABLE_ITEM_NAMES) {
    if (lower.includes(wearable.toLowerCase())) return true
  }
  return false
}
