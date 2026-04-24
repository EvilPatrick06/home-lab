import { useState } from 'react'
import Modal from '../../components/ui/Modal'
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
    <Modal open={open} onClose={onClose} title="Recruit Defenders">
      <div className="space-y-4">
        {barracks.length === 0 ? (
          <p className="text-sm text-gray-400">You need a Barrack facility to recruit defenders.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Barrack</label>
              <select
                value={recruitBarrackId}
                onChange={(e) => setRecruitBarrackId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              >
                <option value="">Select barrack...</option>
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
              <label className="text-xs text-gray-500">Names (comma-separated, max 4)</label>
              <input
                type="text"
                value={recruitNames}
                onChange={(e) => setRecruitNames(e.target.value)}
                placeholder="e.g. Brynn, Torval, Elda, Garth"
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <p className="text-xs text-gray-500">Cost: 50 GP per defender</p>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRecruit}
            disabled={!recruitBarrackId || !recruitNames.trim()}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            Recruit
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
  const [wallSquares, setWallSquares] = useState(1)

  const handleBuildWalls = (): void => {
    if (!selectedBastion || wallSquares <= 0) return
    buildDefensiveWalls(selectedBastion.id, wallSquares)
    onClose()
    setWallSquares(1)
  }

  return (
    <Modal open={open} onClose={onClose} title="Build Defensive Walls">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">Each 5-ft square costs 250 GP and takes 10 days to build.</p>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Squares to build</label>
          <input
            type="number"
            min={1}
            max={20}
            value={wallSquares}
            onChange={(e) => setWallSquares(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="text-xs text-gray-400">
          Cost: {wallSquares * 250} GP &middot; Time: {wallSquares * 10} days
          {selectedBastion?.defensiveWalls && (
            <> &middot; Current: {selectedBastion.defensiveWalls.squaresBuilt} squares</>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleBuildWalls}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold transition-colors"
          >
            Build ({wallSquares * 250} GP)
          </button>
        </div>
      </div>
    </Modal>
  )
}
