import type {
  AbilityName,
  CreatureSize,
  DamageType,
  ItemRarity,
  WeaponCategory,
  WeaponMasteryProperty
} from './shared-enums'

// Ensure imported types are used for type-safety
type _AbilityName = AbilityName
type _CreatureSize = CreatureSize
type _WeaponMasteryProperty = WeaponMasteryProperty

export interface WeaponData {
  name: string
  category: WeaponCategory
  damage: string
  damageType: DamageType
  weight: number
  properties: string[]
  cost: string
  mastery: string
  description: string
}

export interface ArmorData {
  name: string
  category: string
  baseAC: number
  dexBonus: boolean
  dexBonusMax: number | null
  weight: number
  stealthDisadvantage: boolean
  cost: string
  description: string
}

export interface GearData {
  name: string
  category: string
  weight: number
  cost: string
  description: string
}

export interface EquipmentFile {
  weapons: WeaponData[]
  armor: ArmorData[]
  gear: GearData[]
}

export interface MagicItemData {
  id: string
  name: string
  rarity: ItemRarity
  type: string
  attunement: boolean
  cost: string
  description: string
}

export interface InvocationPrerequisites {
  cantrip?: string
  invocation?: string
  requiresDamageCantrip?: boolean
  requiresAttackRollCantrip?: boolean
}

export interface InvocationData {
  id: string
  name: string
  description: string
  levelRequirement: number
  prerequisites: InvocationPrerequisites | null
  isPactBoon?: boolean
  repeatable?: boolean
}

export interface MetamagicData {
  id: string
  name: string
  description: string
  sorceryPointCost: number | string
}

export interface CraftingItem {
  name: string
  rawMaterialCost: string
  craftingTimeDays: number
  category: string
}

export interface CraftingToolEntry {
  tool: string
  items: CraftingItem[]
}

export interface MountData {
  id: string
  name: string
  size: string
  sizeX: number
  sizeY: number
  ac: number
  hp: number
  speed: number
  str: number
  dex: number
  con: number
  canBeControlled: boolean
  category: 'land' | 'water' | 'air'
  description: string
  cost: number
}

export interface MountsFile {
  mounts: MountData[]
}

export interface CurrencyConfigEntry {
  key: string
  label: string
  fullName: string
  ring: string
  bg: string
  text: string
}
