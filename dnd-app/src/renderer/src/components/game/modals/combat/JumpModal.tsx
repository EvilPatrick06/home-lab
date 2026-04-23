import { useState } from 'react'
import type { Character } from '../../../../types/character'
import { abilityModifier } from '../../../../types/character-common'
import NarrowModalShell from '../shared/NarrowModalShell'

interface JumpModalProps {
  character: Character
  movementRemaining: number
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

export default function JumpModal({
  character,
  movementRemaining,
  onClose,
  onBroadcastResult
}: JumpModalProps): JSX.Element {
  const [jumpType, setJumpType] = useState<'long' | 'high'>('long')
  const [runningStart, setRunningStart] = useState(true)

  const strScore = character.abilityScores.strength
  const strMod = abilityModifier(strScore)

  // Long Jump: STR score in feet (standing: half)
  const longJumpDist = runningStart ? strScore : Math.floor(strScore / 2)
  // High Jump: 3 + STR mod in feet (standing: half)
  const highJumpDist = runningStart ? 3 + strMod : Math.floor((3 + strMod) / 2)

  const jumpDist = jumpType === 'long' ? longJumpDist : Math.max(0, highJumpDist)
  const remainingAfterJump = Math.max(0, movementRemaining - jumpDist)

  return (
    <NarrowModalShell title="Jump Calculator" onClose={onClose}>
      {/* Jump Type */}
      <div className="mb-3">
        <span className="text-xs text-gray-400">Jump Type:</span>
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => setJumpType('long')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg cursor-pointer ${
              jumpType === 'long' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Long Jump
          </button>
          <button
            onClick={() => setJumpType('high')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg cursor-pointer ${
              jumpType === 'high' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            High Jump
          </button>
        </div>
      </div>

      {/* Running Start */}
      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={runningStart}
            onChange={(e) => setRunningStart(e.target.checked)}
            className="accent-amber-600"
          />
          <span className="text-xs text-gray-300">Running start (10ft move before jump)</span>
        </label>
        {!runningStart && <p className="text-[10px] text-yellow-400 mt-1">Standing jump = half distance</p>}
      </div>

      {/* Result */}
      <div className="bg-gray-800 rounded-lg p-4 text-center mb-4">
        <div className="text-xs text-gray-400 mb-1">
          {jumpType === 'long' ? 'Long Jump Distance' : 'High Jump Height'}
        </div>
        <div className="text-3xl font-bold text-amber-400 font-mono">{jumpDist} ft</div>
        <div className="text-xs text-gray-500 mt-1">
          {jumpType === 'long'
            ? `STR score (${strScore})${!runningStart ? ' / 2' : ''}`
            : `3 + STR mod (${strMod})${!runningStart ? ' / 2' : ''}`}
        </div>
        <div className="text-xs text-gray-400 mt-2">Each foot costs 1 ft of movement</div>
        <div className={`text-xs mt-1 ${remainingAfterJump > 0 ? 'text-green-400' : 'text-red-400'}`}>
          Movement remaining: {movementRemaining} ft → {remainingAfterJump} ft
        </div>
        {jumpDist > movementRemaining && (
          <div className="text-xs text-red-400 mt-1">Not enough movement for full jump!</div>
        )}
      </div>

      <div className="text-[10px] text-gray-500 mb-3">
        Landing in difficult terrain: DC 10 Acrobatics or fall Prone.
      </div>

      <button
        onClick={() => {
          const typeStr = jumpType === 'long' ? 'Long Jump' : 'High Jump'
          onBroadcastResult(
            `${character.name} makes a ${typeStr} (${runningStart ? 'running' : 'standing'}): ${jumpDist} ft!`
          )
          onClose()
        }}
        className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
      >
        Jump!
      </button>
    </NarrowModalShell>
  )
}
