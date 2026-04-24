import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import type { Bastion } from '../../types/bastion'
import type { BastionModalsProps } from './bastion-modal-types'

export function TreasuryModal({
  open,
  onClose,
  selectedBastion,
  depositGold,
  withdrawGold
}: {
  open: boolean
  onClose: () => void
  selectedBastion: Bastion | undefined
  depositGold: BastionModalsProps['depositGold']
  withdrawGold: BastionModalsProps['withdrawGold']
}): JSX.Element {
  const [treasuryAmount, setTreasuryAmount] = useState(0)
  const [treasuryMode, setTreasuryMode] = useState<'deposit' | 'withdraw'>('deposit')

  const handleTreasury = (): void => {
    if (!selectedBastion || treasuryAmount <= 0) return
    if (treasuryMode === 'deposit') {
      depositGold(selectedBastion.id, treasuryAmount)
    } else {
      withdrawGold(selectedBastion.id, treasuryAmount)
    }
    onClose()
    setTreasuryAmount(0)
  }

  return (
    <Modal open={open} onClose={onClose} title="Bastion Treasury">
      <div className="space-y-4">
        <div className="text-sm text-gray-400">
          Current treasury: <span className="text-yellow-400 font-medium">{selectedBastion?.treasury ?? 0} GP</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTreasuryMode('deposit')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${treasuryMode === 'deposit' ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Deposit
          </button>
          <button
            onClick={() => setTreasuryMode('withdraw')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${treasuryMode === 'withdraw' ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Withdraw
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Amount (GP)</label>
          <input
            type="number"
            min={0}
            value={treasuryAmount}
            onChange={(e) => setTreasuryAmount(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTreasury}
            disabled={treasuryAmount <= 0}
            className={`px-4 py-2 text-sm text-white rounded font-semibold transition-colors ${treasuryMode === 'deposit' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'} disabled:bg-gray-700 disabled:text-gray-500`}
          >
            {treasuryMode === 'deposit' ? 'Deposit' : 'Withdraw'} {treasuryAmount} GP
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function AdvanceTimeModal({
  open,
  onClose,
  selectedBastion,
  advanceTime
}: {
  open: boolean
  onClose: () => void
  selectedBastion: Bastion | undefined
  advanceTime: BastionModalsProps['advanceTime']
}): JSX.Element {
  const [advanceDays, setAdvanceDays] = useState(7)

  const handleAdvanceTime = (): void => {
    if (!selectedBastion || advanceDays <= 0) return
    advanceTime(selectedBastion.id, advanceDays)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Advance In-Game Time">
      <div className="space-y-4">
        <div className="text-sm text-gray-400">
          Current day: <span className="text-amber-400 font-medium">{selectedBastion?.inGameTime.currentDay ?? 1}</span>
          &middot; Last turn: Day {selectedBastion?.inGameTime.lastBastionTurnDay ?? 0}
          &middot; Next turn in:{' '}
          {Math.max(
            0,
            (selectedBastion?.inGameTime.turnFrequencyDays ?? 7) -
              ((selectedBastion?.inGameTime.currentDay ?? 0) - (selectedBastion?.inGameTime.lastBastionTurnDay ?? 0))
          )}{' '}
          days
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Days to advance</label>
          <input
            type="number"
            min={1}
            max={365}
            value={advanceDays}
            onChange={(e) => setAdvanceDays(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          />
        </div>
        {selectedBastion && selectedBastion.construction.length > 0 && (
          <div className="text-xs text-gray-400">
            {selectedBastion.construction.length} construction project(s) will advance by {advanceDays} days.
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdvanceTime}
            disabled={advanceDays <= 0}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            Advance {advanceDays} Day{advanceDays !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function DeleteBastionModal({
  open,
  onClose,
  selectedBastion,
  deleteBastion,
  setSelectedBastionId
}: {
  open: boolean
  onClose: () => void
  selectedBastion: Bastion | undefined
  deleteBastion: BastionModalsProps['deleteBastion']
  setSelectedBastionId: (id: string | null) => void
}): JSX.Element {
  return (
    <Modal open={open} onClose={onClose} title="Delete Bastion">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Are you sure you want to delete <span className="text-gray-200 font-medium">{selectedBastion?.name}</span>?
          This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selectedBastion) {
                deleteBastion(selectedBastion.id)
                setSelectedBastionId(null)
                onClose()
              }
            }}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-semibold transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </Modal>
  )
}
