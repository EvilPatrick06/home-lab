import { useEffect, useState } from 'react'
import { trigger3dDice } from '../../../components/game/dice3d'
import { SKILLS_5E } from '../../../data/skills'
import { rollSingle } from '../../../services/dice/dice-service'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import { abilityModifier, formatMod } from '../../../types/character-common'

interface RollRequestOverlayProps {
  request: {
    id: string
    type: 'ability' | 'save' | 'skill'
    ability?: string
    skill?: string
    dc: number
    isSecret: boolean
  }
  character: Character | null
  onRoll: (result: { roll: number; modifier: number; total: number; success: boolean }) => void
  onDismiss: () => void
}

type AbilityKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'

const ABILITY_LABELS: Record<string, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma'
}

export default function RollRequestOverlay({ request, character, onRoll, onDismiss }: RollRequestOverlayProps) {
  const [result, setResult] = useState<{ roll: number; modifier: number; total: number; success: boolean } | null>(null)
  const [visible, setVisible] = useState(false)

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  // Auto-dismiss after showing result
  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(onDismiss, 300)
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [result, onDismiss])

  const getRequestLabel = (): string => {
    if (request.type === 'skill' && request.skill) {
      return `${request.skill} Check`
    }
    const abilityLabel = ABILITY_LABELS[request.ability ?? ''] ?? request.ability ?? 'Unknown'
    return request.type === 'save' ? `${abilityLabel} Saving Throw` : `${abilityLabel} Check`
  }

  const getModifier = (): number => {
    if (!character) return 0
    const char5e = character as Character5e
    const profBonus = Math.ceil(char5e.level / 4) + 1

    if (request.type === 'skill' && request.skill) {
      const skillDef = SKILLS_5E.find((s) => s.name.toLowerCase() === request.skill?.toLowerCase())
      const ability = (skillDef?.ability ?? 'intelligence') as AbilityKey
      const abilityScore = char5e.abilityScores?.[ability] ?? 10
      const mod = abilityModifier(abilityScore)

      const skillEntry = char5e.skills?.find((s) => s.name.toLowerCase() === request.skill?.toLowerCase())
      if (skillEntry?.expertise) return mod + profBonus * 2
      if (skillEntry?.proficient) return mod + profBonus
      return mod
    }

    if (request.ability) {
      const abilityKey = request.ability as AbilityKey
      const abilityScore = char5e.abilityScores?.[abilityKey] ?? 10
      const mod = abilityModifier(abilityScore)

      if (request.type === 'save') {
        const hasSaveProf = char5e.proficiencies?.savingThrows?.includes(abilityKey)
        return hasSaveProf ? mod + profBonus : mod
      }

      return mod
    }

    return 0
  }

  const modifier = getModifier()

  const handleRoll = () => {
    const roll = rollSingle(20)
    const total = roll + modifier
    const success = total >= request.dc
    trigger3dDice({ formula: '1d20', rolls: [roll], total, rollerName: character?.name ?? 'Player' })
    const rollResult = { roll, modifier, total, success }
    setResult(rollResult)
    onRoll(rollResult)
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex justify-center transition-transform duration-300 ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <div className="mx-4 mt-4 w-full max-w-md bg-gray-900 border border-amber-600/50 rounded-xl shadow-2xl shadow-amber-900/20 overflow-hidden">
        {/* Urgency bar */}
        <div className="h-1 bg-gradient-to-r from-amber-600 via-purple-500 to-amber-600 animate-pulse" />

        <div className="p-4">
          {!result ? (
            <>
              {/* Request Info */}
              <div className="text-center mb-3">
                <div className="text-xs text-amber-400/70 uppercase tracking-wider font-medium mb-1">DM Requests</div>
                <div className="text-lg font-bold text-white">{getRequestLabel()}</div>
                {!request.isSecret && <div className="text-sm text-gray-400 mt-0.5">DC {request.dc}</div>}
                {request.isSecret && (
                  <div className="text-xs text-purple-400 mt-0.5">Secret roll &mdash; DC hidden</div>
                )}
              </div>

              {/* Roll Button */}
              {character ? (
                <button
                  onClick={handleRoll}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <span className="text-lg">&#9860;</span>
                  Roll d20 {formatMod(modifier)}
                </button>
              ) : (
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">No character loaded</div>
                  <button
                    onClick={handleRoll}
                    className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors text-sm"
                  >
                    Roll d20 (no modifier)
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Result Display */
            <div className="text-center py-2">
              <div
                className={`text-4xl font-bold mb-1 ${
                  result.roll === 20 ? 'text-green-400' : result.roll === 1 ? 'text-red-400' : 'text-white'
                }`}
              >
                {result.total}
              </div>
              <div className="text-sm text-gray-400 mb-2">
                <span
                  className={`font-mono ${
                    result.roll === 20 ? 'text-green-400' : result.roll === 1 ? 'text-red-400' : ''
                  }`}
                >
                  d20: {result.roll}
                </span>{' '}
                {formatMod(result.modifier)}
              </div>
              {!request.isSecret && (
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    result.success
                      ? 'bg-green-900/50 text-green-400 border border-green-700'
                      : 'bg-red-900/50 text-red-400 border border-red-700'
                  }`}
                >
                  {result.success ? 'Success' : 'Failure'}
                </span>
              )}
              {result.roll === 20 && <div className="text-green-400 text-xs font-semibold mt-1">Natural 20!</div>}
              {result.roll === 1 && <div className="text-red-400 text-xs font-semibold mt-1">Natural 1!</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
