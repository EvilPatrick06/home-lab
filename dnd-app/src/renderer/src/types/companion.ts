// Phase 28d — CompanionType and Companion5e moved to
// `src/shared/types/companion.ts` so the Electron main process can reach them
// (they're in the Character5e transitive closure). Re-exported here so existing
// renderer imports keep resolving unchanged; the runtime constants below stay.
export type { Companion5e, CompanionType } from '../../../shared/types/companion'

export const STANDARD_FAMILIAR_FORMS = [
  'bat',
  'cat',
  'crab',
  'frog',
  'hawk',
  'lizard',
  'octopus',
  'owl',
  'rat',
  'raven',
  'scorpion',
  'spider',
  'venomous-snake'
] as const

export const CHAIN_PACT_FAMILIAR_FORMS = [
  'imp',
  'pseudodragon',
  'quasit',
  'slaad-tadpole',
  'sphinx-of-wonder',
  'sprite'
] as const

export const STEED_FORMS = ['warhorse', 'pony', 'camel', 'elk', 'mastiff'] as const

export interface WildShapeTier {
  minLevel: number
  maxCR: number
  allowFlying: boolean
  allowSwimming: boolean
}

export const WILD_SHAPE_TIERS: WildShapeTier[] = [
  { minLevel: 2, maxCR: 0.25, allowFlying: false, allowSwimming: false },
  { minLevel: 4, maxCR: 0.5, allowFlying: false, allowSwimming: true },
  { minLevel: 8, maxCR: 1, allowFlying: true, allowSwimming: true }
]
