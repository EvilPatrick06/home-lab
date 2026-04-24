// === DM Toolbox Types (DMG 2024 Chapter 3) ===

export interface TrapScaling {
  levels: string
  damage?: string
  saveDC?: number
  attackBonus?: number
  description?: string
}

export interface Trap {
  id: string
  name: string
  level: 'nuisance' | 'deadly'
  trigger: string
  duration: string
  detection: string
  disarm: string
  effect: string
  damage?: string
  saveDC?: number
  saveAbility?: string
  description: string
  scaling?: Record<string, TrapScaling>
}

export interface Hazard {
  id: string
  name: string
  level: 'nuisance' | 'deadly'
  type: 'environmental' | 'magical' | 'biological'
  effect: string
  damage?: string
  saveDC?: number
  saveAbility?: string
  avoidance?: string
  description: string
  scaling?: Record<string, { damage?: string; saveDC?: number }>
}

export interface Poison {
  id: string
  name: string
  type: 'contact' | 'ingested' | 'inhaled' | 'injury'
  rarity: string
  cost: string
  saveDC: number
  effect: string
  duration?: string
  description: string
}

export interface EnvironmentalEffect {
  id: string
  name: string
  category: 'weather' | 'terrain' | 'magical' | 'planar'
  effect: string
  mechanicalEffect?: string
  saveDC?: number
  saveAbility?: string
  description: string
}

export interface Curse {
  id: string
  name: string
  type: 'personal' | 'item' | 'location' | 'environmental'
  effect: string
  removal: string
  saveDC?: number
  saveAbility?: string
  description: string
  source?: string
}

export interface Disease {
  id: string
  name: string
  type: 'disease'
  vector: string
  saveDC: number
  saveAbility: string
  incubation: string
  symptoms: string
  effect: string
  mechanicalEffect: string
  cure: string
  description: string
}

export interface SiegeEquipment {
  id: string
  name: string
  ac: number
  hp: number
  size: string
  damage: string | null
  damageType: string | null
  rangeNormal: number | null
  rangeLong: number | null
  crew: number | null
  cost: string
  description: string
}

export interface Settlement {
  id: string
  name: string
  populationMin: number
  populationMax: number | null
  description: string
  typicalGovernment: string[]
  defenses: string[]
  availableServices: string[]
  availableShops: string[]
  availableTemples: string[]
  maxSpellLevel: number
}

export interface SupernaturalGift {
  id: string
  name: string
  type: 'blessing' | 'charm'
  duration?: string
  effect: string
  description: string
}

export interface ActiveEnvironmentalEffect {
  id: string
  effectId: string
  name: string
  appliedAt: number
}

export interface ActiveDisease {
  id: string
  diseaseId: string
  name: string
  targetId: string
  targetName: string
  onsetDate?: string
  successCount: number
  failCount: number
  notes?: string
}

export interface ActiveCurse {
  id: string
  curseId: string
  name: string
  targetId: string
  targetName: string
  source?: string
  notes?: string
}

export interface PlacedTrap {
  id: string
  trapId: string
  name: string
  gridX: number
  gridY: number
  armed: boolean
  revealed: boolean
}
