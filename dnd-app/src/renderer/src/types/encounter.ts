export interface EncounterMonster {
  monsterId: string
  count: number
  notes?: string
}

export interface EncounterLoot {
  currency?: { cp?: number; sp?: number; ep?: number; gp?: number; pp?: number }
  items?: Array<{ name: string; quantity: number; description?: string }>
}

export interface Encounter {
  id: string
  name: string
  description: string
  readAloudText?: string
  monsters: EncounterMonster[]
  difficulty: 'trivial' | 'easy' | 'moderate' | 'hard' | 'deadly'
  levelRange: { min: number; max: number }
  tactics?: string
  environment?: string
  trigger?: string
  loot?: EncounterLoot
  mapId?: string
  totalXP: number
}
