import { addToast } from '../hooks/use-toast'
import { load5eAlignmentDescriptions } from '../services/data-provider'
import { logger } from '../utils/logger'

export const ALIGNMENT_DESCRIPTIONS: Record<string, string> = {}

load5eAlignmentDescriptions()
  .then((data) => {
    Object.assign(ALIGNMENT_DESCRIPTIONS, data)
  })
  .catch((err) => {
    logger.error('Failed to load alignment descriptions', err)
    addToast('Failed to load alignment descriptions', 'error')
  })
