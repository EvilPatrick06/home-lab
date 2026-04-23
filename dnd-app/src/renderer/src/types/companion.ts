export type CompanionType = 'familiar' | 'wildShape' | 'steed' | 'summoned'

export interface Companion5e {
  id: string
  type: CompanionType
  name: string
  monsterStatBlockId: string
  currentHP: number
  maxHP: number
  tokenId?: string // linked MapToken.id when placed on map
  ownerId: string // Character5e.id
  dismissed: boolean // familiars can be dismissed to pocket dimension
  sourceSpell?: string // "find-familiar", "find-steed", "summon-beast"
  concentrationCasterId?: string
  createdAt: string
}

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
