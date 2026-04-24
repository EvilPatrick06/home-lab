import { addToast } from '../hooks/use-toast'
import { type ConditionEntry, load5eConditions } from '../services/data-provider'
import { logger } from '../utils/logger'

export interface ConditionDef {
  name: string
  description: string
  system: 'dnd5e'
  hasValue?: boolean
  maxValue?: number
}

let _conditions: ConditionDef[] | null = null
let _buffs: ConditionDef[] | null = null
let _initPromise: Promise<void> | null = null

function mapEntry(e: ConditionEntry): ConditionDef {
  return {
    name: e.name,
    description: e.description,
    system: e.system as 'dnd5e',
    hasValue: e.hasValue || undefined,
    maxValue: e.maxValue ?? undefined
  }
}

async function ensureLoaded(): Promise<void> {
  if (_conditions) return
  if (!_initPromise) {
    _initPromise = load5eConditions().then((all) => {
      _conditions = all.filter((c) => c.type === 'condition').map(mapEntry)
      _buffs = all.filter((c) => c.type === 'buff').map(mapEntry)
    })
  }
  await _initPromise
}

export async function getConditions5e(): Promise<ConditionDef[]> {
  await ensureLoaded()
  return _conditions!
}

export async function getBuffs5e(): Promise<ConditionDef[]> {
  await ensureLoaded()
  return _buffs!
}

// Legacy synchronous exports - populated after first async load
// Components should migrate to async versions
export const CONDITIONS_5E: ConditionDef[] = []
export const BUFFS_5E: ConditionDef[] = []

// Auto-populate synchronous exports
ensureLoaded()
  .then(() => {
    CONDITIONS_5E.length = 0
    CONDITIONS_5E.push(..._conditions!)
    BUFFS_5E.length = 0
    BUFFS_5E.push(..._buffs!)
  })
  .catch((err) => {
    logger.error('Failed to load conditions data', err)
    addToast('Failed to load conditions data', 'error')
  })

export function getConditionsForSystem(): ConditionDef[] {
  return CONDITIONS_5E
}
