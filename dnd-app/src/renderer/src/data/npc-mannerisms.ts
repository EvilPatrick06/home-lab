import { addToast } from '../hooks/use-toast'
import { load5eNpcMannerisms } from '../services/data-provider'
import { logger } from '../utils/logger'

export const NPC_VOICE_DESCRIPTIONS: readonly string[] = []
export const NPC_MANNERISMS: readonly string[] = []

load5eNpcMannerisms()
  .then((data) => {
    ;(NPC_VOICE_DESCRIPTIONS as string[]).push(...(data.voiceDescriptions ?? []))
    ;(NPC_MANNERISMS as string[]).push(...(data.mannerisms ?? []))
  })
  .catch((err) => {
    logger.error('Failed to load NPC mannerisms', err)
    addToast('Failed to load NPC mannerisms', 'error')
  })
