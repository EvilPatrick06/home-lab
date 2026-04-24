import { addToast } from '../hooks/use-toast'
import { load5eVariantItems, type VariantItemEntry } from '../services/data-provider'
import { logger } from '../utils/logger'

type _VariantItemEntry = VariantItemEntry

export const VARIANT_ITEMS: Record<string, { label: string; variants: string[] }> = {}

load5eVariantItems()
  .then((data) => {
    Object.assign(VARIANT_ITEMS, data)
  })
  .catch((err) => {
    logger.error('Failed to load variant items', err)
    addToast('Failed to load variant items', 'error')
  })
