/**
 * Shared types for bastion modal components.
 * Extracted from BastionModals.tsx to break circular dependency with child modals.
 */

import type {
  BasicFacilityDef,
  Bastion,
  BastionOrderType,
  ConstructionProject,
  FacilitySpace,
  SpecialFacilityDef,
  SpecialFacilityType
} from '../../types/bastion'
import type { Character } from '../../types/character'
import type { Character5e } from '../../types/character-5e'

export interface BastionModalsProps {
  // Visibility toggles
  showCreateModal: boolean
  setShowCreateModal: (v: boolean) => void
  showAddBasic: boolean
  setShowAddBasic: (v: boolean) => void
  showAddSpecial: boolean
  setShowAddSpecial: (v: boolean) => void
  showTurnModal: boolean
  setShowTurnModal: (v: boolean) => void
  showRecruitModal: boolean
  setShowRecruitModal: (v: boolean) => void
  showWallsModal: boolean
  setShowWallsModal: (v: boolean) => void
  showTreasuryModal: boolean
  setShowTreasuryModal: (v: boolean) => void
  showAdvanceTime: boolean
  setShowAdvanceTime: (v: boolean) => void
  showDeleteConfirm: boolean
  setShowDeleteConfirm: (v: boolean) => void

  // Data
  selectedBastion: Bastion | undefined
  characters: Character[]
  facilityDefs: SpecialFacilityDef[]
  basicFacilityDefs: BasicFacilityDef[]
  maxSpecial: number
  maxFacilityLevel: number
  owner5e: Character5e | null

  // Store callbacks
  saveBastion: (b: Bastion) => void
  setSelectedBastionId: (id: string | null) => void
  addSpecialFacility: (bastionId: string, type: SpecialFacilityType, name: string, space: FacilitySpace) => void
  startConstruction: (
    bastionId: string,
    project: Omit<ConstructionProject, 'id' | 'startedAt' | 'daysCompleted'>
  ) => void
  startTurn: (bastionId: string) => ReturnType<(id: string) => { turnNumber: number } | null>
  issueOrder: (
    bastionId: string,
    turnNumber: number,
    facilityId: string,
    orderType: BastionOrderType,
    details: string,
    cost: number
  ) => void
  issueMaintainOrder: (bastionId: string, turnNumber: number) => void
  rollAndResolveEvent: (bastionId: string, turnNumber: number) => void
  completeTurn: (bastionId: string, turnNumber: number) => void
  recruitDefenders: (bastionId: string, barrackId: string, names: string[]) => void
  buildDefensiveWalls: (bastionId: string, squares: number) => void
  depositGold: (bastionId: string, amount: number) => void
  withdrawGold: (bastionId: string, amount: number) => void
  advanceTime: (bastionId: string, days: number) => void
  deleteBastion: (bastionId: string) => void
}
