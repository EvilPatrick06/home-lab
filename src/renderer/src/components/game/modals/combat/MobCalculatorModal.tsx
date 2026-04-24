import { useState } from 'react'

interface MobCalculatorModalProps {
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

interface MobTableRow {
  d20Needed: string
  attackersPerHit: number
}

const MOB_ATTACK_TABLE: MobTableRow[] = [
  { d20Needed: '1-5', attackersPerHit: 1 },
  { d20Needed: '6-12', attackersPerHit: 2 },
  { d20Needed: '13-14', attackersPerHit: 3 },
  { d20Needed: '15-16', attackersPerHit: 4 },
  { d20Needed: '17-18', attackersPerHit: 5 },
  { d20Needed: '19', attackersPerHit: 10 },
  { d20Needed: '20', attackersPerHit: 20 }
]

function getAttackersPerHit(d20Needed: number): number {
  if (d20Needed <= 1) return 1
  if (d20Needed <= 5) return 1
  if (d20Needed <= 12) return 2
  if (d20Needed <= 14) return 3
  if (d20Needed <= 16) return 4
  if (d20Needed <= 18) return 5
  if (d20Needed === 19) return 10
  if (d20Needed >= 20) return 20
  return 20
}

export default function MobCalculatorModal({ onClose, onBroadcastResult }: MobCalculatorModalProps): JSX.Element {
  const [attackerCount, setAttackerCount] = useState(10)
  const [attackBonus, setAttackBonus] = useState(4)
  const [targetAC, setTargetAC] = useState(15)
  const [damagePerHit, setDamagePerHit] = useState('')
  const [showResult, setShowResult] = useState(false)

  const d20Needed = Math.max(1, Math.min(20, targetAC - attackBonus))
  const attackersPerHit = getAttackersPerHit(d20Needed)
  const hits = attackersPerHit > 0 ? Math.floor(attackerCount / attackersPerHit) : 0
  const misses = attackerCount - hits

  const parseDamage = (notation: string): number => {
    if (!notation.trim()) return 0
    const match = notation.match(/^(\d+)?d(\d+)(?:\s*\+\s*(\d+))?$/)
    if (match) {
      const count = parseInt(match[1] ?? '1', 10)
      const sides = parseInt(match[2], 10)
      const bonus = match[3] ? parseInt(match[3], 10) : 0
      const avgPerDie = (sides + 1) / 2
      return Math.floor(count * avgPerDie + bonus)
    }
    const num = parseInt(notation, 10)
    return Number.isNaN(num) ? 0 : num
  }

  const avgDamagePerHit = parseDamage(damagePerHit)
  const totalDamage = hits * avgDamagePerHit

  const handleCalculate = (): void => {
    setShowResult(true)
  }

  const handleBroadcast = (): void => {
    let message = `Mob Attack: ${hits} out of ${attackerCount} attackers hit (AC ${targetAC}, +${attackBonus} to hit, need ${d20Needed}+).`
    if (avgDamagePerHit > 0) {
      message += ` Total damage: ${totalDamage} (${avgDamagePerHit} avg per hit).`
    }
    onBroadcastResult(message)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="text-lg font-bold text-amber-400">Mob Attack Calculator</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Number of Attackers</label>
              <input
                type="number"
                min={1}
                max={100}
                value={attackerCount}
                onChange={(e) => {
                  setAttackerCount(Math.max(1, Number(e.target.value)))
                  setShowResult(false)
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Attack Bonus</label>
              <input
                type="number"
                min={-5}
                max={20}
                value={attackBonus}
                onChange={(e) => {
                  setAttackBonus(Number(e.target.value))
                  setShowResult(false)
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Target AC</label>
              <input
                type="number"
                min={1}
                max={30}
                value={targetAC}
                onChange={(e) => {
                  setTargetAC(Math.max(1, Number(e.target.value)))
                  setShowResult(false)
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Damage per Hit <span className="text-gray-600">(e.g. 1d8+3)</span>
              </label>
              <input
                type="text"
                value={damagePerHit}
                onChange={(e) => {
                  setDamagePerHit(e.target.value)
                  setShowResult(false)
                }}
                placeholder="1d8+3"
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
              />
            </div>
          </div>

          {/* d20 Needed indicator */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-3 text-center">
            <span className="text-xs text-gray-400">d20 roll needed to hit:</span>{' '}
            <span className="text-lg font-bold text-amber-400">
              {d20Needed >= 21 ? 'Impossible' : d20Needed <= 1 ? 'Auto-hit' : `${d20Needed}+`}
            </span>
          </div>

          {/* Calculate Button */}
          <button
            onClick={handleCalculate}
            className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded font-medium"
          >
            Calculate
          </button>

          {/* Result */}
          {showResult && (
            <div className="bg-gray-800 rounded-lg border border-amber-700/50 p-4 space-y-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  <span className="text-green-400">{hits}</span>
                  <span className="text-gray-500 text-lg mx-1">of</span>
                  <span>{attackerCount}</span>
                  <span className="text-gray-400 text-lg ml-2">hit</span>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {misses} miss{misses !== 1 ? 'es' : ''}
                  <span className="mx-2 text-gray-700">|</span>
                  {attackersPerHit} attacker{attackersPerHit !== 1 ? 's' : ''} per hit
                </div>
              </div>

              {avgDamagePerHit > 0 && (
                <div className="text-center border-t border-gray-700 pt-3">
                  <div className="text-xs text-gray-400">Total Damage (avg)</div>
                  <div className="text-xl font-bold text-red-400">{totalDamage}</div>
                  <div className="text-xs text-gray-500">
                    {hits} hits x {avgDamagePerHit} avg damage
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reference Table */}
          <div>
            <div className="text-xs text-gray-500 mb-2">DMG Mob Attack Reference</div>
            <div className="border border-gray-700 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-800 text-gray-400">
                    <th className="text-left px-3 py-1.5">d20 Needed</th>
                    <th className="text-left px-3 py-1.5">Attackers per Hit</th>
                  </tr>
                </thead>
                <tbody>
                  {MOB_ATTACK_TABLE.map((row) => {
                    const isActive =
                      (row.d20Needed === '1-5' && d20Needed >= 1 && d20Needed <= 5) ||
                      (row.d20Needed === '6-12' && d20Needed >= 6 && d20Needed <= 12) ||
                      (row.d20Needed === '13-14' && d20Needed >= 13 && d20Needed <= 14) ||
                      (row.d20Needed === '15-16' && d20Needed >= 15 && d20Needed <= 16) ||
                      (row.d20Needed === '17-18' && d20Needed >= 17 && d20Needed <= 18) ||
                      (row.d20Needed === '19' && d20Needed === 19) ||
                      (row.d20Needed === '20' && d20Needed >= 20)
                    return (
                      <tr
                        key={row.d20Needed}
                        className={`border-t border-gray-700/50 ${
                          isActive ? 'bg-amber-900/30 text-amber-300' : 'text-gray-300'
                        }`}
                      >
                        <td className="px-3 py-1.5">{row.d20Needed}</td>
                        <td className="px-3 py-1.5">{row.attackersPerHit} per hit</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button onClick={onClose} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded">
            Close
          </button>
          {showResult && (
            <button
              onClick={handleBroadcast}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded font-medium"
            >
              Broadcast Result
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
