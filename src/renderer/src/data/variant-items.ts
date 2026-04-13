import { addToast } from '../hooks/use-toast'
import { load5eVariantItems, type VariantItemEntry } from '../services/data-provider'
import { logger } from '../utils/logger'

type _VariantItemEntry = VariantItemEntry

export const VARIANT_ITEMS: Record<string, { label: string; variants: string[] }> = {}

export const loadVariantItemsForUi = async (): Promise<Record<string, { label: string; variants: string[] }>> => {
  if (Object.keys(VARIANT_ITEMS).length > 0) return VARIANT_ITEMS

  try {
    const data = await load5eVariantItems()
    Object.assign(VARIANT_ITEMS, data)
    return VARIANT_ITEMS
  } catch (err) {
    logger.error('Failed to load variant items', err)
    addToast('Failed to load variant items', 'error')
    return VARIANT_ITEMS
  }
}

loadVariantItemsForUi().catch((err) => {
  logger.error('Failed to initialize variant items', err)
})
