import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import { useT } from '../../i18n'
import type { Bastion } from '../../types/bastion'
import type { BastionModalsProps } from './bastion-modal-types'

export function RecruitDefendersModal({
  open,
  onClose,
  selectedBastion,
  recruitDefenders
}: {
  open: boolean
  onClose: () => void
  selectedBastion: Bastion | undefined
  recruitDefenders: BastionModalsProps['recruitDefenders']
}): JSX.Element {
  const { t } = useT()
  const [recruitBarrackId, setRecruitBarrackId] = useState('')
  const [recruitNames, setRecruitNames] = useState('')

  const barracks = selectedBastion?.specialFacilities.filter((f) => f.type === 'barrack') ?? []

  const handleRecruit = (): void => {
    if (!selectedBastion || !recruitBarrackId || !recruitNames.trim()) return
    const names = recruitNames
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    recruitDefenders(selectedBastion.id, recruitBarrackId, names)
    onClose()
    setRecruitNames('')
  }

  return (
    <Modal open={open} onClose={onClose} title={t('pages.recruitDefendersModal.title')}>
      <div className="space-y-4">
        {barracks.length === 0 ? (
          <p className="text-sm text-muted">{t('pages.recruitDefendersModal.needBarrack')}</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">{t('pages.recruitDefendersModal.barrack')}</label>
              <select
                name="recruit-barrack-id"
                value={recruitBarrackId}
                onChange={(e) => setRecruitBarrackId(e.target.value)}
                className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
              >
                <option value="">{t('pages.recruitDefendersModal.selectBarrack')}</option>
                {barracks.map((b) => {
                  const count = selectedBastion?.defenders.filter((d) => d.barrackId === b.id).length ?? 0
                  const max = b.space === 'vast' ? 25 : 12
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} ({count}/{max})
                    </option>
                  )
                })}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">{t('pages.recruitDefendersModal.namesLabel')}</label>
              <input
                name="recruit-names"
                type="text"
                value={recruitNames}
                onChange={(e) => setRecruitNames(e.target.value)}
                placeholder={t('pages.recruitDefendersModal.namesPlaceholder')}
                className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <p className="text-xs text-gray-500">{t('pages.recruitDefendersModal.cost')}</p>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={handleRecruit}
            disabled={!recruitBarrackId || !recruitNames.trim()}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            {t('pages.recruitDefendersModal.recruit')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function BuildWallsModal({
  open,
  onClose,
  selectedBastion,
  buildDefensiveWalls
}: {
  open: boolean
  onClose: () => void
  selectedBastion: Bastion | undefined
  buildDefensiveWalls: BastionModalsProps['buildDefensiveWalls']
}): JSX.Element {
  const { t } = useT()
  const [wallSquares, setWallSquares] = useState(1)

  const handleBuildWalls = (): void => {
    if (!selectedBastion || wallSquares <= 0) return
    buildDefensiveWalls(selectedBastion.id, wallSquares)
    onClose()
    setWallSquares(1)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('pages.buildWallsModal.title')}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('pages.buildWallsModal.costHint')}</p>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('pages.buildWallsModal.squaresToBuild')}</label>
          <input
            name="wall-squares"
            type="number"
            min={1}
            max={20}
            value={wallSquares}
            onChange={(e) => setWallSquares(Number(e.target.value))}
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="text-xs text-muted">
          {t('pages.buildWallsModal.costTime', { cost: wallSquares * 250, days: wallSquares * 10 })}
          {selectedBastion?.defensiveWalls && (
            <> {t('pages.buildWallsModal.current', { squares: selectedBastion.defensiveWalls.squaresBuilt })}</>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={handleBuildWalls}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold transition-colors"
          >
            {t('pages.buildWallsModal.build', { cost: wallSquares * 250 })}
          </button>
        </div>
      </div>
    </Modal>
  )
}
