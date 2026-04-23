import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { rollSingle } from '../../../../services/dice/dice-service'

interface GroupRollModalProps {
  onClose: () => void
  onBroadcastResult: (message: string) => void
  isDM?: boolean
}

type CheckType = 'ability' | 'save' | 'skill'

interface RollResult {
  name: string
  roll: number
  mod: number
  total: number
  success: boolean
}

const ABILITIES = [
  { value: 'strength', label: 'Strength' },
  { value: 'dexterity', label: 'Dexterity' },
  { value: 'constitution', label: 'Constitution' },
  { value: 'intelligence', label: 'Intelligence' },
  { value: 'wisdom', label: 'Wisdom' },
  { value: 'charisma', label: 'Charisma' }
]

const SKILLS = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival'
]

export default function GroupRollModal({ onClose, onBroadcastResult }: GroupRollModalProps) {
  const [checkType, setCheckType] = useState<CheckType>('ability')
  const [ability, setAbility] = useState('strength')
  const [skill, setSkill] = useState('Perception')
  const [dc, setDc] = useState(15)
  const [scope, setScope] = useState<'all' | 'selected'>('all')
  const [isSecret, setIsSecret] = useState(false)
  const [results, setResults] = useState<RollResult[] | null>(null)
  const [requested, setRequested] = useState(false)

  const getCheckLabel = (): string => {
    if (checkType === 'skill') return `${skill} Check`
    const abilityLabel = ABILITIES.find((a) => a.value === ability)?.label ?? ability
    return checkType === 'save' ? `${abilityLabel} Saving Throw` : `${abilityLabel} Check`
  }

  const handleRequestRoll = () => {
    setRequested(true)

    // Simulate results from players (in a real networked game, these would come via P2P)
    const simulatedPlayers = ['Theron', 'Lyra', 'Grimjaw', 'Senna']
    const simulated: RollResult[] = simulatedPlayers.map((name) => {
      const roll = rollSingle(20)
      const mod = Math.floor(Math.random() * 7) - 1
      const total = roll + mod
      trigger3dDice({ formula: '1d20', rolls: [roll], total, rollerName: name })
      return { name, roll, mod, total, success: total >= dc }
    })

    setTimeout(() => {
      setResults(simulated)
    }, 800)
  }

  const passCount = results?.filter((r) => r.success).length ?? 0
  const totalCount = results?.length ?? 0
  const groupSuccess = passCount >= Math.ceil(totalCount / 2)

  const handleDone = () => {
    if (results) {
      const label = getCheckLabel()
      const passNames = results
        .filter((r) => r.success)
        .map((r) => r.name)
        .join(', ')
      const failNames = results
        .filter((r) => !r.success)
        .map((r) => r.name)
        .join(', ')
      const summary = `Group ${label} (DC ${dc}): ${groupSuccess ? 'GROUP PASSES' : 'GROUP FAILS'} (${passCount}/${totalCount}). Passed: ${passNames || 'None'}. Failed: ${failNames || 'None'}.`
      onBroadcastResult(summary)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-amber-400">Group Roll</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Check Type Tabs */}
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {[
              { value: 'ability' as CheckType, label: 'Ability Check' },
              { value: 'save' as CheckType, label: 'Saving Throw' },
              { value: 'skill' as CheckType, label: 'Skill Check' }
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setCheckType(tab.value)}
                className={`flex-1 text-sm py-2 rounded-md font-medium transition-colors ${
                  checkType === tab.value
                    ? 'bg-amber-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Ability / Skill Selector */}
          {checkType === 'skill' ? (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill</label>
              <select
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {SKILLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ability</label>
              <select
                value={ability}
                onChange={(e) => setAbility(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {ABILITIES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* DC and Options */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">DC</label>
              <input
                type="number"
                min={1}
                max={30}
                value={dc}
                onChange={(e) => setDc(Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as 'all' | 'selected')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Players</option>
                <option value="selected">Selected Players</option>
              </select>
            </div>
          </div>

          {/* Secret Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isSecret}
              onChange={(e) => setIsSecret(e.target.checked)}
              className="rounded bg-gray-800 border-gray-600 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-gray-300">Secret roll (results visible to DM only)</span>
          </label>

          {/* Request Button */}
          {!requested && (
            <button
              onClick={handleRequestRoll}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              Request Roll &mdash; {getCheckLabel()} (DC {dc})
            </button>
          )}

          {/* Waiting State */}
          {requested && !results && (
            <div className="text-center py-4">
              <div className="animate-pulse text-amber-400 text-sm font-medium">Waiting for player rolls...</div>
            </div>
          )}

          {/* Results Table */}
          {results && (
            <div className="space-y-3">
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800 text-gray-400">
                      <th className="text-left px-3 py-2 font-medium">Player</th>
                      <th className="text-center px-3 py-2 font-medium">Roll</th>
                      <th className="text-center px-3 py-2 font-medium">Mod</th>
                      <th className="text-center px-3 py-2 font-medium">Total</th>
                      <th className="text-center px-3 py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.name} className="border-t border-gray-800">
                        <td className="px-3 py-2 text-white font-medium">{r.name}</td>
                        <td
                          className={`text-center px-3 py-2 ${
                            r.roll === 20
                              ? 'text-green-400 font-bold'
                              : r.roll === 1
                                ? 'text-red-400 font-bold'
                                : 'text-gray-300'
                          }`}
                        >
                          {r.roll}
                        </td>
                        <td className="text-center px-3 py-2 text-gray-400">{r.mod >= 0 ? `+${r.mod}` : r.mod}</td>
                        <td className="text-center px-3 py-2 text-white font-semibold">{r.total}</td>
                        <td className="text-center px-3 py-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              r.success ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                            }`}
                          >
                            {r.success ? 'Pass' : 'Fail'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Group Result */}
              <div
                className={`text-center py-3 rounded-lg border ${
                  groupSuccess
                    ? 'bg-green-900/20 border-green-700 text-green-400'
                    : 'bg-red-900/20 border-red-700 text-red-400'
                }`}
              >
                <div className="text-xs text-gray-400 mb-1">
                  Group Check ({passCount}/{totalCount} passed, majority needed)
                </div>
                <div className="text-lg font-bold">{groupSuccess ? 'Group Succeeds' : 'Group Fails'}</div>
              </div>

              <button
                onClick={handleDone}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                Post Results &amp; Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
