import { addToast } from '../hooks/use-toast'
import { load5eEffectDefinitions } from '../services/data-provider'
import type { EffectSource } from '../types/effects'
import { logger } from '../utils/logger'

// Module-level caches
let magicItemEffects: Record<string, EffectSource> = {}
let featEffects: Record<string, EffectSource> = {}
let fightingStyleEffects: Record<string, EffectSource> = {}
let consumableEffects: Record<string, EffectSource> = {}

load5eEffectDefinitions()
  .then((data) => {
    const d = data as {
      magicItems: Record<string, EffectSource>
      feats: Record<string, EffectSource>
      fightingStyles: Record<string, EffectSource>
      consumables: Record<string, EffectSource>
    }
    magicItemEffects = d.magicItems ?? {}
    featEffects = d.feats ?? {}
    fightingStyleEffects = d.fightingStyles ?? {}
    consumableEffects = d.consumables ?? {}
  })
  .catch((err) => {
    logger.error('Failed to load effect definitions', err)
    addToast('Failed to load effect definitions', 'error')
  })

// ─── Lookup Functions ────────────────────────────────────────

export function getMagicItemEffects(name: string): EffectSource | undefined {
  // Try exact match first
  if (magicItemEffects[name]) return magicItemEffects[name]
  // Try partial match for +X items
  const normalized = name.toLowerCase()
  for (const [key, val] of Object.entries(magicItemEffects)) {
    if (normalized.includes(key.toLowerCase())) return val
  }
  return undefined
}

export function getFeatEffects(name: string): EffectSource | undefined {
  return featEffects[name]
}

export function getFightingStyleEffects(name: string): EffectSource | undefined {
  return fightingStyleEffects[name]
}

export function getConsumableEffects(name: string): EffectSource | undefined {
  if (consumableEffects[name]) return consumableEffects[name]
  const normalized = name.toLowerCase()
  for (const [key, val] of Object.entries(consumableEffects)) {
    if (normalized.includes(key.toLowerCase())) return val
  }
  return undefined
}

export function getAllEffectDefinitions(): Record<string, EffectSource> {
  return { ...magicItemEffects, ...featEffects, ...fightingStyleEffects, ...consumableEffects }
}
