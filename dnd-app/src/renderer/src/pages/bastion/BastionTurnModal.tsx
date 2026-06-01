import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { useT } from '../../i18n'
import type { Bastion, BastionOrderType, SpecialFacilityDef } from '../../types/bastion'
import { getBpPerTurn } from '../../types/bastion'
import { ORDER_LABELS } from './bastion-constants'
import type { BastionModalsProps } from './bastion-modal-types'

export function BastionTurnModal({
  open,
  onClose,
  selectedBastion,
  facilityDefs,
  activeTurnNumber,
  setActiveTurnNumber,
  ownerLevel,
  startTurn: _startTurn,
  issueOrder,
  issueMaintainOrder,
  rollAndResolveEvent,
  completeTurn
}: {
  open: boolean
  onClose: () => void
  selectedBastion: Bastion | undefined
  facilityDefs: SpecialFacilityDef[]
  activeTurnNumber: number | null
  setActiveTurnNumber: (n: number | null) => void
  ownerLevel: number
  startTurn: BastionModalsProps['startTurn']
  issueOrder: BastionModalsProps['issueOrder']
  issueMaintainOrder: BastionModalsProps['issueMaintainOrder']
  rollAndResolveEvent: BastionModalsProps['rollAndResolveEvent']
  completeTurn: BastionModalsProps['completeTurn']
}): JSX.Element {
  const { t } = useT()
  const [turnOrders, setTurnOrders] = useState<
    Record<string, { orderType: BastionOrderType; details: string; cost: number }>
  >({})
  const [turnMaintain, setTurnMaintain] = useState(false)
  const [turnStep, setTurnStep] = useState<'orders' | 'event' | 'summary'>('orders')

  // Reset local state whenever the modal opens for a new turn
  useEffect(() => {
    if (open) {
      setTurnOrders({})
      setTurnMaintain(false)
      setTurnStep('orders')
    }
  }, [open])

  const activeTurn = selectedBastion?.turns.find((t) => t.turnNumber === activeTurnNumber) ?? null

  const handleExecuteTurn = (): void => {
    if (!selectedBastion || activeTurnNumber === null) return
    for (const [facilityId, order] of Object.entries(turnOrders)) {
      issueOrder(selectedBastion.id, activeTurnNumber, facilityId, order.orderType, order.details, order.cost)
    }
    if (turnMaintain) {
      issueMaintainOrder(selectedBastion.id, activeTurnNumber)
    }
    setTurnStep('event')
  }

  const handleRollEvent = (): void => {
    if (!selectedBastion || activeTurnNumber === null) return
    if (!turnMaintain) {
      issueMaintainOrder(selectedBastion.id, activeTurnNumber)
    }
    rollAndResolveEvent(selectedBastion.id, activeTurnNumber)
    setTurnStep('summary')
  }

  const handleCompleteTurn = (): void => {
    if (!selectedBastion || activeTurnNumber === null) return
    completeTurn(selectedBastion.id, activeTurnNumber, ownerLevel)
    onClose()
    setActiveTurnNumber(null)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('pages.bastionTurnModal.title', { turn: activeTurnNumber ?? '' })}>
      <div className="space-y-4">
        {turnStep === 'orders' && selectedBastion && (
          <>
            <p className="text-sm text-muted">{t('pages.bastionTurnModal.assignOrdersHint')}</p>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={turnMaintain}
                onChange={(e) => setTurnMaintain(e.target.checked)}
                className="rounded bg-surface-2 border-gray-600"
              />
              {t('pages.bastionTurnModal.issueMaintainOrder')}
            </label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {selectedBastion.specialFacilities.map((facility) => {
                const def = facilityDefs.find((d) => d.type === facility.type)
                const currentOrder = turnOrders[facility.id]
                return (
                  <div key={facility.id} className="bg-surface-2 rounded p-3 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-fg">{facility.name}</span>
                      {def && def.orders.length > 0 && (
                        <select
                          value={currentOrder?.orderType ?? ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (!val) {
                              const next = { ...turnOrders }
                              delete next[facility.id]
                              setTurnOrders(next)
                            } else {
                              setTurnOrders({
                                ...turnOrders,
                                [facility.id]: { orderType: val as BastionOrderType, details: '', cost: 0 }
                              })
                            }
                          }}
                          className="bg-surface border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">{t('pages.bastionTurnModal.idle')}</option>
                          {def.orders.map((o) => (
                            <option key={o} value={o}>
                              {ORDER_LABELS[o]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {currentOrder && def && (
                      <select
                        value={currentOrder.details}
                        onChange={(e) => {
                          const selectedName = e.target.value
                          const option = def.orderOptions.find(
                            (o) => o.order === currentOrder.orderType && o.name === selectedName
                          )
                          setTurnOrders({
                            ...turnOrders,
                            [facility.id]: { ...currentOrder, details: selectedName, cost: option?.cost ?? 0 }
                          })
                        }}
                        className="w-full bg-surface border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
                      >
                        <option value="">{t('pages.bastionTurnModal.selectAction')}</option>
                        {def.orderOptions
                          .filter((o) => o.order === currentOrder.orderType)
                          .map((o) => (
                            <option key={o.name} value={o.name}>
                              {o.name} {o.cost > 0 ? `(${o.cost} GP)` : ''}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
              >
                {t('common.actions.cancel')}
              </button>
              <button
                onClick={handleExecuteTurn}
                className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold transition-colors"
              >
                {t('pages.bastionTurnModal.executeTurn')}
              </button>
            </div>
          </>
        )}
        {turnStep === 'event' && (
          <>
            <p className="text-sm text-muted">{t('pages.bastionTurnModal.ordersIssuedRollPrompt')}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setTurnStep('summary')
                }}
                className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
              >
                {t('pages.bastionTurnModal.skipEvent')}
              </button>
              <button
                onClick={handleRollEvent}
                className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold transition-colors"
              >
                {t('pages.bastionTurnModal.rollD100Event')}
              </button>
            </div>
          </>
        )}
        {turnStep === 'summary' && activeTurn && (
          <>
            <h3 className="text-sm font-semibold text-gray-200">{t('pages.bastionTurnModal.turnSummary')}</h3>
            {activeTurn.orders.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">{t('pages.bastionTurnModal.orders')}</p>
                {activeTurn.orders.map((o, i) => (
                  <div key={i} className="text-xs text-gray-300 bg-surface-2 rounded px-2 py-1">
                    {o.facilityName}: {o.details || ORDER_LABELS[o.orderType]}
                    {o.goldCost ? ` (-${o.goldCost} GP)` : ''}
                  </div>
                ))}
              </div>
            )}
            {getBpPerTurn(ownerLevel) > 0 && (
              <div className="bg-purple-900/20 rounded p-2 border border-purple-800">
                <span className="text-xs text-purple-400">{t('pages.bastionTurnModal.bastionPointsEarned')}</span>
                <span className="text-xs text-gray-200 ml-1">+{getBpPerTurn(ownerLevel)} BP</span>
              </div>
            )}
            {activeTurn.eventOutcome && (
              <div className="bg-surface-2 rounded p-3 border border-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
                    d100: {activeTurn.eventRoll}
                  </span>
                  <span className="text-xs text-muted">{activeTurn.eventType}</span>
                </div>
                <p className="text-sm text-gray-200">{activeTurn.eventOutcome}</p>
              </div>
            )}
            {activeTurn.eventDetails?.gamingHallWinnings && (
              <div className="bg-yellow-900/20 rounded p-2 border border-yellow-800">
                <span className="text-xs text-yellow-400">{t('pages.bastionTurnModal.gamingHallWinnings')}</span>
                <span className="text-xs text-gray-200 ml-1">
                  {t('pages.bastionTurnModal.goldEarned', {
                    gold: (activeTurn.eventDetails.gamingHallWinnings as { goldEarned: number }).goldEarned
                  })}
                </span>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCompleteTurn}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded font-semibold transition-colors"
              >
                {t('pages.bastionTurnModal.completeTurn')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
