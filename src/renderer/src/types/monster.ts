// === Creature Classification Types ===

export type CreatureSize = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan'

export type CreatureType =
  | 'Aberration'
  | 'Beast'
  | 'Celestial'
  | 'Construct'
  | 'Dragon'
  | 'Elemental'
  | 'Fey'
  | 'Fiend'
  | 'Giant'
  | 'Humanoid'
  | 'Monstrosity'
  | 'Ooze'
  | 'Plant'
  | 'Undead'

// === Monster Sub-Types ===

export interface MonsterSpeed {
  walk: number
  burrow?: number
  climb?: number
  fly?: number
  swim?: number
  hover?: boolean
}

export interface MonsterTrait {
  name: string
  description: string
}

export interface MonsterAction {
  name: string
  description: string
  attackType?: 'melee' | 'ranged' | 'melee-or-ranged'
  toHit?: number
  reach?: number
  rangeNormal?: number
  rangeLong?: number
  targets?: number
  damageDice?: string
  damageType?: string
  additionalDamage?: string
  saveDC?: number
  saveAbility?: string
  areaOfEffect?: { type: 'cone' | 'cube' | 'cylinder' | 'emanation' | 'line' | 'sphere'; size: number }
  recharge?: string // e.g. "5-6", "6", "short rest"
  multiattackActions?: string[]
  /** Action casts a spell (e.g., Invisibility, Fog Cloud) — no attack roll or save */
  spellAction?: boolean
  /** Non-combat utility action (e.g., Shape-Shift, Teleport) */
  utility?: boolean
  /** Uses per day for limited-use actions */
  usesPerDay?: number
}

export interface MonsterSpellcasting {
  ability: string
  saveDC: number
  attackBonus: number
  notes?: string
  atWill?: string[]
  perDay?: Record<string, string[]> // "3" → ["fireball", "counterspell"], "1" → ["dominate person"]
  slots?: Record<string, { slots: number; spells: string[] }> // "1st" → { slots: 4, spells: [...] }
}

export interface MonsterSenses {
  blindsight?: number
  darkvision?: number
  tremorsense?: number
  truesight?: number
  passivePerception: number
}

// === Main Stat Block ===

export interface MonsterStatBlock {
  id: string // kebab-case, e.g. "goblin"
  name: string
  group?: string // Family grouping, e.g. "Goblins"
  size: CreatureSize
  type: CreatureType
  subtype?: string // "Goblinoid", "Shapechanger", etc.
  alignment: string
  ac: number
  acType?: string // "Natural Armor", "Leather Armor", etc.
  hp: number // Average HP
  hitDice: string // "2d6", "17d10 + 85"
  speed: MonsterSpeed
  abilityScores: {
    str: number
    dex: number
    con: number
    int: number
    wis: number
    cha: number
  }
  savingThrows?: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>>
  skills?: Record<string, number>
  resistances?: string[]
  vulnerabilities?: string[]
  damageImmunities?: string[]
  conditionImmunities?: string[]
  senses: MonsterSenses
  languages: string[]
  telepathy?: number
  cr: string // "0", "1/8", "1/4", "1/2", "1"-"30"
  xp: number
  proficiencyBonus: number
  initiative?: { modifier: number; score: number }
  habitat?: string[]
  gear?: string[]
  traits?: MonsterTrait[]
  spellcasting?: MonsterSpellcasting
  actions: MonsterAction[]
  bonusActions?: MonsterAction[]
  reactions?: MonsterAction[]
  legendaryActions?: { uses: number; actions: MonsterAction[] }
  lairActions?: {
    description?: string
    initiativeCount: number
    actions: { name: string; description: string }[]
  }
  regionalEffects?: {
    description?: string
    effects: { name?: string; description: string }[]
    endCondition?: string
  }
  source?: 'mm2025' | 'legacy'
  description?: string
  tags?: string[]
  tokenSize: { x: number; y: number } // Derived from size
}

// === Helpers ===

export function getSizeTokenDimensions(size: CreatureSize): { x: number; y: number } {
  switch (size) {
    case 'Tiny':
      return { x: 1, y: 1 }
    case 'Small':
      return { x: 1, y: 1 }
    case 'Medium':
      return { x: 1, y: 1 }
    case 'Large':
      return { x: 2, y: 2 }
    case 'Huge':
      return { x: 3, y: 3 }
    case 'Gargantuan':
      return { x: 4, y: 4 }
  }
}

/** CR string → numeric for sorting/comparison */
export function crToNumber(cr: string): number {
  if (cr === '0') return 0
  if (cr === '1/8') return 0.125
  if (cr === '1/4') return 0.25
  if (cr === '1/2') return 0.5
  return parseFloat(cr)
}

/** Get ability modifier from score */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}
