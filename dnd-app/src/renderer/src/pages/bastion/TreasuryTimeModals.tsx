import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import { useT } from '../../i18n'
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
  const { t } = useT()
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
    <Modal open={open} onClose={onClose} title={t('pages.treasuryModal.title')}>
      <div className="space-y-4">
        <div className="text-sm text-muted">
          {t('pages.treasuryModal.currentTreasury')}{' '}
          <span className="text-yellow-400 font-medium">{selectedBastion?.treasury ?? 0} GP</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTreasuryMode('deposit')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${treasuryMode === 'deposit' ? 'bg-green-700 text-white' : 'bg-surface-2 text-muted'}`}
          >
            {t('pages.treasuryModal.deposit')}
          </button>
          <button
            onClick={() => setTreasuryMode('withdraw')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${treasuryMode === 'withdraw' ? 'bg-red-700 text-white' : 'bg-surface-2 text-muted'}`}
          >
            {t('pages.treasuryModal.withdraw')}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('pages.treasuryModal.amount')}</label>
          <input
            type="number"
            min={0}
            value={treasuryAmount}
            onChange={(e) => setTreasuryAmount(Number(e.target.value))}
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={handleTreasury}
            disabled={treasuryAmount <= 0}
            className={`px-4 py-2 text-sm text-white rounded font-semibold transition-colors ${treasuryMode === 'deposit' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'} disabled:bg-gray-700 disabled:text-gray-500`}
          >
            {treasuryMode === 'deposit'
              ? t('pages.treasuryModal.depositAmount', { amount: treasuryAmount })
              : t('pages.treasuryModal.withdrawAmount', { amount: treasuryAmount })}
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
  const { t } = useT()
  const [advanceDays, setAdvanceDays] = useState(7)

  const handleAdvanceTime = (): void => {
    if (!selectedBastion || advanceDays <= 0) return
    advanceTime(selectedBastion.id, advanceDays)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('pages.advanceTimeModal.title')}>
      <div className="space-y-4">
        <div className="text-sm text-muted">
          {t('pages.advanceTimeModal.currentDay')}{' '}
          <span className="text-accent font-medium">{selectedBastion?.inGameTime.currentDay ?? 1}</span>
          {t('pages.advanceTimeModal.lastNextTurn', {
            lastTurn: selectedBastion?.inGameTime.lastBastionTurnDay ?? 0,
            nextTurn: Math.max(
              0,
              (selectedBastion?.inGameTime.turnFrequencyDays ?? 7) -
                ((selectedBastion?.inGameTime.currentDay ?? 0) - (selectedBastion?.inGameTime.lastBastionTurnDay ?? 0))
            )
          })}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('pages.advanceTimeModal.daysToAdvance')}</label>
          <input
            type="number"
            min={1}
            max={365}
            value={advanceDays}
            onChange={(e) => setAdvanceDays(Number(e.target.value))}
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
          />
        </div>
        {selectedBastion && selectedBastion.construction.length > 0 && (
          <div className="text-xs text-muted">
            {t('pages.advanceTimeModal.constructionWillAdvance', {
              count: selectedBastion.construction.length,
              days: advanceDays
            })}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={handleAdvanceTime}
            disabled={advanceDays <= 0}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            {t('pages.advanceTimeModal.advance', { days: advanceDays, plural: advanceDays !== 1 ? 's' : '' })}
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
  const { t } = useT()
  return (
    <Modal open={open} onClose={onClose} title={t('pages.deleteBastionModal.title')}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {t('pages.deleteBastionModal.confirmPrefix')}{' '}
          <span className="text-gray-200 font-medium">{selectedBastion?.name}</span>
          {t('pages.deleteBastionModal.confirmSuffix')}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
          >
            {t('common.actions.cancel')}
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
            {t('common.actions.delete')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
