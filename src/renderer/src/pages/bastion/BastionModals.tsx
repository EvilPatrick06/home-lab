import { useState } from 'react'
import type { BastionModalsProps } from './bastion-modal-types'

export type { BastionModalsProps } from './bastion-modal-types'

import { BastionTurnModal } from './BastionTurnModal'
import { CreateBastionModal } from './CreateBastionModal'
import { BuildWallsModal, RecruitDefendersModal } from './DefenseModals'
import { AddBasicFacilityModal, AddSpecialFacilityModal } from './FacilityModals'
import { AdvanceTimeModal, DeleteBastionModal, TreasuryModal } from './TreasuryTimeModals'

export default function BastionModals(props: BastionModalsProps): JSX.Element {
  const [activeTurnNumber, setActiveTurnNumber] = useState<number | null>(null)

  const handleStartTurnAndOpen = (): void => {
    if (!props.selectedBastion) return
    const turn = props.startTurn(props.selectedBastion.id)
    if (turn) {
      setActiveTurnNumber(turn.turnNumber)
    }
  }

  // Auto-start turn when showTurnModal becomes true
  // The parent calls handleStartTurn which opens the modal
  // We need to initialize turn when modal opens
  if (props.showTurnModal && activeTurnNumber === null && props.selectedBastion) {
    handleStartTurnAndOpen()
  }

  return (
    <>
      <CreateBastionModal
        open={props.showCreateModal}
        onClose={() => props.setShowCreateModal(false)}
        characters={props.characters}
        saveBastion={props.saveBastion}
        setSelectedBastionId={props.setSelectedBastionId}
      />
      <AddBasicFacilityModal
        open={props.showAddBasic}
        onClose={() => props.setShowAddBasic(false)}
        selectedBastion={props.selectedBastion}
        basicFacilityDefs={props.basicFacilityDefs}
        startConstruction={props.startConstruction}
      />
      <AddSpecialFacilityModal
        open={props.showAddSpecial}
        onClose={() => props.setShowAddSpecial(false)}
        selectedBastion={props.selectedBastion}
        facilityDefs={props.facilityDefs}
        maxSpecial={props.maxSpecial}
        maxFacilityLevel={props.maxFacilityLevel}
        owner5e={props.owner5e}
        addSpecialFacility={props.addSpecialFacility}
      />
      <BastionTurnModal
        open={props.showTurnModal}
        onClose={() => {
          props.setShowTurnModal(false)
          setActiveTurnNumber(null)
        }}
        selectedBastion={props.selectedBastion}
        facilityDefs={props.facilityDefs}
        activeTurnNumber={activeTurnNumber}
        setActiveTurnNumber={setActiveTurnNumber}
        startTurn={props.startTurn}
        issueOrder={props.issueOrder}
        issueMaintainOrder={props.issueMaintainOrder}
        rollAndResolveEvent={props.rollAndResolveEvent}
        completeTurn={props.completeTurn}
      />
      <RecruitDefendersModal
        open={props.showRecruitModal}
        onClose={() => props.setShowRecruitModal(false)}
        selectedBastion={props.selectedBastion}
        recruitDefenders={props.recruitDefenders}
      />
      <BuildWallsModal
        open={props.showWallsModal}
        onClose={() => props.setShowWallsModal(false)}
        selectedBastion={props.selectedBastion}
        buildDefensiveWalls={props.buildDefensiveWalls}
      />
      <TreasuryModal
        open={props.showTreasuryModal}
        onClose={() => props.setShowTreasuryModal(false)}
        selectedBastion={props.selectedBastion}
        depositGold={props.depositGold}
        withdrawGold={props.withdrawGold}
      />
      <AdvanceTimeModal
        open={props.showAdvanceTime}
        onClose={() => props.setShowAdvanceTime(false)}
        selectedBastion={props.selectedBastion}
        advanceTime={props.advanceTime}
      />
      <DeleteBastionModal
        open={props.showDeleteConfirm}
        onClose={() => props.setShowDeleteConfirm(false)}
        selectedBastion={props.selectedBastion}
        deleteBastion={props.deleteBastion}
        setSelectedBastionId={props.setSelectedBastionId}
      />
    </>
  )
}
