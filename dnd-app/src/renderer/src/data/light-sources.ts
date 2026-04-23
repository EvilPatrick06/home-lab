import { addToast } from '../hooks/use-toast'
import { type LightSourceEntry, load5eLightSources } from '../services/data-provider'
import { logger } from '../utils/logger'

type _LightSourceEntry = LightSourceEntry

export interface LightSourceDef {
  durationSeconds: number
  brightRadius: number
  dimRadius: number
}

export const LIGHT_SOURCES: Record<string, LightSourceDef> = {}
export const LIGHT_SOURCE_LABELS: Record<string, string> = {}

load5eLightSources()
  .then((data) => {
    for (const [key, entry] of Object.entries(data)) {
      LIGHT_SOURCES[key] = {
        durationSeconds: entry.durationSeconds ?? Infinity,
        brightRadius: entry.brightRadius,
        dimRadius: entry.dimRadius
      }
      LIGHT_SOURCE_LABELS[key] = entry.label
    }
  })
  .catch((err) => {
    logger.error('Failed to load light sources', err)
    addToast('Failed to load light sources', 'error')
  })
