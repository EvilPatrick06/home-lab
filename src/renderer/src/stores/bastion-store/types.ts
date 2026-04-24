import type {
  BasicFacilityType,
  Bastion,
  BastionOrderType,
  BastionTurn,
  ConstructionProject,
  FacilitySpace,
  MenagerieCreature,
  SpecialFacility,
  SpecialFacilityDef,
  SpecialFacilityType
} from '../../types/bastion'

// ---- Shared helpers used by multiple slices ----

export function getBastion(bastions: Bastion[], id: string): Bastion | undefined {
  return bastions.find((b) => b.id === id)
}

export function updateBastion(bastions: Bastion[], id: string, updates: Partial<Bastion>): Bastion[] {
  return bastions.map((b) => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b))
}

// ---- Slice state types ----

export interface CrudSliceState {
  bastions: Bastion[]
  loading: boolean
  hasLoaded: boolean
  facilityDefs: SpecialFacilityDef[]

  loadBastions: () => Promise<void>
  saveBastion: (bastion: Bastion) => Promise<void>
  deleteBastion: (id: string) => Promise<void>
  deleteAllBastions: () => Promise<void>
  setFacilityDefs: (defs: SpecialFacilityDef[]) => void
}

export interface FacilitySliceState {
  addBasicFacility: (bastionId: string, type: BasicFacilityType, name: string, space: FacilitySpace) => void
  removeBasicFacility: (bastionId: string, facilityId: string) => void
  addSpecialFacility: (bastionId: string, type: SpecialFacilityType, name: string, space: FacilitySpace) => void
  removeSpecialFacility: (bastionId: string, facilityId: string) => void
  swapSpecialFacility: (
    bastionId: string,
    oldId: string,
    newType: SpecialFacilityType,
    newName: string,
    newSpace: FacilitySpace
  ) => void
  enlargeSpecialFacility: (bastionId: string, facilityId: string) => void
  configureFacility: (bastionId: string, facilityId: string, config: Partial<SpecialFacility>) => void
  recruitDefenders: (bastionId: string, barrackId: string, names: string[]) => void
  removeDefenders: (bastionId: string, defenderIds: string[]) => void
  startConstruction: (
    bastionId: string,
    project: Omit<ConstructionProject, 'id' | 'startedAt' | 'daysCompleted'>
  ) => void
  completeConstruction: (bastionId: string, projectId: string) => void
  buildDefensiveWalls: (bastionId: string, squares: number) => void
  depositGold: (bastionId: string, amount: number) => void
  withdrawGold: (bastionId: string, amount: number) => void
  addCreature: (bastionId: string, facilityId: string, creature: MenagerieCreature) => void
  removeCreature: (bastionId: string, facilityId: string, creatureName: string) => void
  updateNotes: (bastionId: string, notes: string) => void
  updateBastionMetadata: (bastionId: string, updates: Partial<Bastion>) => void
  rollBackTurn: (bastionId: string, turnNumber: number) => void
  clearConstruction: (bastionId: string, projectId: string) => void
  reassignDefenders: (bastionId: string, defenderId: string, newFacilityId: string) => void
}

export interface EventSliceState {
  advanceTime: (bastionId: string, days: number) => void
  checkAndTriggerTurn: (bastionId: string) => boolean
  startTurn: (bastionId: string) => BastionTurn | null
  issueOrder: (
    bastionId: string,
    turnNumber: number,
    facilityId: string,
    orderType: BastionOrderType,
    details: string,
    goldCost?: number
  ) => void
  issueMaintainOrder: (bastionId: string, turnNumber: number) => void
  rollAndResolveEvent: (bastionId: string, turnNumber: number) => void
  completeTurn: (bastionId: string, turnNumber: number) => void
}

export type BastionState = CrudSliceState & FacilitySliceState & EventSliceState
