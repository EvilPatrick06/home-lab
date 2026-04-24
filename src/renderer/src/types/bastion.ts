import { logger } from '../utils/logger'

// ---- Facility Types ----

export type BastionOrderType = 'craft' | 'empower' | 'harvest' | 'maintain' | 'recruit' | 'research' | 'trade'
export type FacilitySpace = 'cramped' | 'roomy' | 'vast'
export type BasicFacilityType = 'bedroom' | 'dining-room' | 'parlor' | 'courtyard' | 'kitchen' | 'storage'

// 29 core + 8 FR + 10 Eberron = 47
export type SpecialFacilityType =
  | 'arcane-study'
  | 'armory'
  | 'barrack'
  | 'garden'
  | 'library'
  | 'sanctuary'
  | 'smithy'
  | 'storehouse'
  | 'workshop' // Lv5 core
  | 'gaming-hall'
  | 'greenhouse'
  | 'laboratory'
  | 'sacristy'
  | 'scriptorium'
  | 'stable'
  | 'teleportation-circle'
  | 'theater'
  | 'training-area'
  | 'trophy-room' // Lv9 core
  | 'archive'
  | 'meditation-chamber'
  | 'menagerie'
  | 'observatory'
  | 'pub'
  | 'reliquary' // Lv13 core
  | 'demiplane'
  | 'guildhall'
  | 'sanctum'
  | 'war-room' // Lv17 core
  | 'amethyst-dragon-den'
  | 'harper-hideout'
  | 'red-wizard-necropolis'
  | 'zhentarim-travel-station' // Lv5 FR
  | 'emerald-enclave-grove'
  | 'lords-alliance-noble-residence'
  | 'order-of-gauntlet-tournament-field' // Lv9 FR
  | 'cult-of-dragon-archive' // Lv13 FR
  | 'dragonmark-outpost' // Lv5 Eberron
  | 'kundarak-vault'
  | 'navigators-helm'
  | 'orien-helm' // Lv9 Eberron
  | 'artificers-forge'
  | 'inquisitives-agency'
  | 'lyrandar-helm'
  | 'manifest-zone'
  | 'museum' // Lv13 Eberron
  | 'construct-forge' // Lv17 Eberron

// ---- Prerequisites (for strict enforcement) ----

export type PrerequisiteType =
  | 'arcane-focus' // Wizard, Sorcerer, Warlock
  | 'holy-symbol' // Cleric, Paladin
  | 'druidic-focus' // Druid
  | 'holy-or-druidic' // Cleric, Paladin, Druid
  | 'spellcasting-focus' // Any spellcaster
  | 'artisan-tools-focus' // Artificer (Eberron)
  | 'fighting-style' // Fighter, Paladin, Ranger
  | 'unarmored-defense' // Barbarian, Monk
  | 'expertise' // Any character with Expertise in a skill
  | 'faction-renown' // FR factions / Eberron dragonmarked houses
  | 'none' // No prerequisite

export interface FacilityPrerequisite {
  type: PrerequisiteType
  description: string
  factionName?: string
  renownThreshold?: number
}

// ---- Facility Instances ----

export interface BasicFacility {
  id: string
  type: BasicFacilityType
  name: string
  space: FacilitySpace
  order: number
}

export interface SpecialFacility {
  id: string
  type: SpecialFacilityType
  name: string
  space: FacilitySpace
  enlarged: boolean
  currentOrder: BastionOrderType | null
  orderStartedAt: string | null
  hirelingNames: string[]
  order: number
  // Type-specific config
  gardenType?: 'decorative' | 'food' | 'herb' | 'poison'
  trainerType?: 'battle' | 'skills' | 'tools' | 'unarmed-combat' | 'weapon'
  chosenTools?: string[]
  pubSpecial?: string
  creatures?: MenagerieCreature[]
  guildType?: string
  manifestZonePlane?: string
  referenceBooks?: string[]
}

export interface MenagerieCreature {
  name: string
  creatureType: string
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge'
  isDefender: boolean
}

// ---- Defenders ----

export interface BastionDefender {
  id: string
  name: string
  barrackId: string
  isUndead?: boolean
  isConstruct?: boolean
}

// ---- Bastion Turn System ----

export interface BastionTurn {
  turnNumber: number
  inGameDate: string
  orders: TurnOrder[]
  maintainIssued: boolean
  eventRoll: number | null
  eventType: string | null
  eventOutcome: string | null
  eventDetails?: Record<string, unknown>
  resolvedAt: string | null
}

export interface TurnOrder {
  facilityId: string
  facilityName: string
  orderType: BastionOrderType
  details: string
  result?: string
  goldCost?: number
  goldGained?: number
  daysRequired?: number
  completedAt?: string
}

// ---- Construction ----

export interface ConstructionProject {
  id: string
  projectType: 'add-basic' | 'add-special' | 'enlarge-basic' | 'enlarge-special' | 'defensive-wall'
  facilityId?: string
  facilityType?: BasicFacilityType
  specialFacilityType?: SpecialFacilityType
  specialFacilityName?: string
  specialFacilitySpace?: FacilitySpace
  targetSpace?: FacilitySpace
  cost: number
  daysRequired: number
  daysCompleted: number
  startedAt: string
}

// ---- Defensive Walls ----

export interface DefensiveWalls {
  squaresBuilt: number
  fullyEnclosed: boolean
}

// ---- In-Game Time Tracking ----

export interface InGameTime {
  currentDay: number
  lastBastionTurnDay: number
  turnFrequencyDays: number
}

// ---- Main Bastion Type ----

export interface Bastion {
  id: string
  name: string
  ownerId: string
  campaignId: string | null
  basicFacilities: BasicFacility[]
  specialFacilities: SpecialFacility[]
  defenders: BastionDefender[]
  turns: BastionTurn[]
  defensiveWalls: DefensiveWalls | null
  construction: ConstructionProject[]
  treasury: number
  inGameTime: InGameTime
  notes: string
  createdAt: string
  updatedAt: string
}

// ---- Facility Definition Types (for bastion-facilities.json) ----

export interface BasicFacilityDef {
  type: BasicFacilityType
  name: string
  description: string
}

export interface FacilityOrderOption {
  order: BastionOrderType
  name: string
  description: string
  daysRequired: number
  cost: number
  levelRequired?: number
}

export interface FacilityCharm {
  name: string
  description: string
  duration: string
}

export interface SpecialFacilityDef {
  type: SpecialFacilityType
  name: string
  description: string
  level: number
  setting: 'core' | 'fr' | 'eberron'
  prerequisite: FacilityPrerequisite | null
  defaultSpace: FacilitySpace
  enlargeable: boolean
  hirelingCount: number
  orders: BastionOrderType[]
  allowMultiple: boolean
  charm?: FacilityCharm
  orderOptions: FacilityOrderOption[]
  permanentBenefit?: string
  tables?: Record<string, unknown>
}

export interface BastionFacilitiesData {
  basicFacilities: BasicFacilityDef[]
  specialFacilities: SpecialFacilityDef[]
}

// ---- Constants ----

export const FACILITY_SPACE_SQUARES: Record<FacilitySpace, number> = {
  cramped: 4,
  roomy: 16,
  vast: 36
}

export const BASIC_FACILITY_COSTS: Record<FacilitySpace, { gp: number; days: number }> = {
  cramped: { gp: 500, days: 20 },
  roomy: { gp: 1000, days: 45 },
  vast: { gp: 3000, days: 125 }
}

export const ENLARGE_COSTS: Record<string, { gp: number; days: number }> = {
  'cramped-roomy': { gp: 500, days: 25 },
  'roomy-vast': { gp: 2000, days: 80 }
}

export const SPECIAL_FACILITY_COSTS: Record<number, { gp: number; days: number }> = {
  5: { gp: 0, days: 0 },
  9: { gp: 0, days: 0 },
  13: { gp: 0, days: 0 },
  17: { gp: 0, days: 0 }
}

// ---- Helper Functions ----

export function getMaxSpecialFacilities(characterLevel: number): number {
  if (characterLevel < 5) return 0
  if (characterLevel < 9) return 2
  if (characterLevel < 13) return 4
  if (characterLevel < 17) return 5
  return 6
}

export function getAvailableFacilityLevel(characterLevel: number): number {
  if (characterLevel >= 17) return 17
  if (characterLevel >= 13) return 13
  if (characterLevel >= 9) return 9
  if (characterLevel >= 5) return 5
  return 0
}

export function createDefaultBastion(ownerId: string, name: string, campaignId?: string): Bastion {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    ownerId,
    campaignId: campaignId ?? null,
    basicFacilities: [
      {
        id: crypto.randomUUID(),
        type: 'bedroom',
        name: 'Bedroom',
        space: 'roomy',
        order: 0
      },
      {
        id: crypto.randomUUID(),
        type: 'storage',
        name: 'Storage',
        space: 'cramped',
        order: 1
      }
    ],
    specialFacilities: [],
    defenders: [],
    turns: [],
    defensiveWalls: null,
    construction: [],
    treasury: 0,
    inGameTime: {
      currentDay: 1,
      lastBastionTurnDay: 0,
      turnFrequencyDays: 7
    },
    notes: '',
    createdAt: now,
    updatedAt: now
  }
}

// ---- Data Migration (old format → new format) ----

interface OldBastion {
  id: string
  name: string
  ownerId: string
  campaignId: string | null
  level?: number
  rooms?: Array<{ id: string; type: string; name: string; size: string; order: number }>
  hirelings?: Array<{ id: string; name: string; role: string }>
  events?: Array<{ id: string; turn: number; description: string; resolvedAt: string | null; outcome?: string }>
  gold?: number
  createdAt: string
  updatedAt: string
}

const OLD_BASIC_TYPES = new Set(['bedroom', 'dining-hall', 'kitchen', 'storage'])

export function migrateBastion(raw: Record<string, unknown>): Bastion {
  // Already new format
  if ('basicFacilities' in raw && 'specialFacilities' in raw) {
    return raw as unknown as Bastion
  }

  const old = raw as unknown as OldBastion
  logger.debug(`[Bastion Migration] Migrating bastion "${old.name}" from old format`)

  const basicFacilities: BasicFacility[] = []
  const specialFacilities: SpecialFacility[] = []

  // Map old rooms
  if (old.rooms) {
    for (const room of old.rooms) {
      const mappedType = room.type === 'dining-hall' ? 'dining-room' : room.type
      if (OLD_BASIC_TYPES.has(room.type)) {
        basicFacilities.push({
          id: room.id,
          type: mappedType as BasicFacilityType,
          name: room.name,
          space: (room.size as FacilitySpace) || 'roomy',
          order: room.order
        })
      } else {
        // Map to closest special facility type
        const specialType = mappedType as SpecialFacilityType
        specialFacilities.push({
          id: room.id,
          type: specialType,
          name: room.name,
          space: (room.size as FacilitySpace) || 'roomy',
          enlarged: false,
          currentOrder: null,
          orderStartedAt: null,
          hirelingNames: [],
          order: room.order
        })
      }
    }
  }

  // Map old events to turns
  const turns: BastionTurn[] = []
  if (old.events) {
    const turnMap = new Map<number, BastionTurn>()
    for (const event of old.events) {
      if (!turnMap.has(event.turn)) {
        turnMap.set(event.turn, {
          turnNumber: event.turn,
          inGameDate: `Day ${event.turn * 7}`,
          orders: [],
          maintainIssued: false,
          eventRoll: null,
          eventType: 'migrated',
          eventOutcome: event.description + (event.outcome ? ` - ${event.outcome}` : ''),
          resolvedAt: event.resolvedAt
        })
      }
    }
    turns.push(...Array.from(turnMap.values()).sort((a, b) => a.turnNumber - b.turnNumber))
  }

  // Map old hirelings to defenders
  const defenders: BastionDefender[] = (old.hirelings || [])
    .filter((h) => h.role === 'defender')
    .map((h) => ({
      id: h.id,
      name: h.name,
      barrackId: ''
    }))

  return {
    id: old.id,
    name: old.name,
    ownerId: old.ownerId,
    campaignId: old.campaignId,
    basicFacilities,
    specialFacilities,
    defenders,
    turns,
    defensiveWalls: null,
    construction: [],
    treasury: old.gold ?? 0,
    inGameTime: {
      currentDay: turns.length > 0 ? turns[turns.length - 1].turnNumber * 7 : 1,
      lastBastionTurnDay: turns.length > 0 ? turns[turns.length - 1].turnNumber * 7 : 0,
      turnFrequencyDays: 7
    },
    notes: '',
    createdAt: old.createdAt,
    updatedAt: new Date().toISOString()
  }
}
