import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { rollSingle } from '../../../../services/dice/dice-service'
import type { Character } from '../../../../types/character'
import type { Character5e } from '../../../../types/character-5e'
import { abilityModifier, formatMod } from '../../../../types/character-common'

interface InfluenceModalProps {
  character: Character
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

const INFLUENCE_APPROACHES = [
  { skill: 'Deception', ability: 'charisma' as const, descKey: 'deception' },
  { skill: 'Intimidation', ability: 'charisma' as const, descKey: 'intimidation' },
  { skill: 'Performance', ability: 'charisma' as const, descKey: 'performance' },
  { skill: 'Persuasion', ability: 'charisma' as const, descKey: 'persuasion' },
  { skill: 'Animal Handling', ability: 'wisdom' as const, descKey: 'animalHandling' }
]

export default function InfluenceModal({ character, onClose, onBroadcastResult }: InfluenceModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [result, setResult] = useState<{ roll: number; total: number; modifier: number } | null>(null)

  const char5e = character as Character5e
  const profBonus = Math.ceil(character.level / 4) + 1

  const approach = INFLUENCE_APPROACHES[selectedIndex]

  const getSkillMod = (): number => {
    const abilMod = abilityModifier(character.abilityScores[approach.ability])
    const skill = char5e.skills?.find((s) => s.name === approach.skill)
    const prof = skill?.expertise ? profBonus * 2 : skill?.proficient ? profBonus : 0
    return abilMod + prof
  }

  const modifier = getSkillMod()

  const handleRoll = (): void => {
    const roll = rollSingle(20)
    const total = roll + modifier
    trigger3dDice({ formula: '1d20', rolls: [roll], total, rollerName: character.name })
    setResult({ roll, total, modifier })
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-surface border border-border rounded-xl p-5 w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">{t('game.influenceModal.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        {/* Approach selection */}
        <div className="space-y-1.5 mb-4">
          {INFLUENCE_APPROACHES.map((appr, i) => {
            const abilMod = abilityModifier(character.abilityScores[appr.ability])
            const skill = char5e.skills?.find((s) => s.name === appr.skill)
            const prof = skill?.expertise ? profBonus * 2 : skill?.proficient ? profBonus : 0
            const mod = abilMod + prof
            return (
              <button
                key={appr.skill}
                onClick={() => {
                  setSelectedIndex(i)
                  setResult(null)
                }}
                className={`w-full text-start px-3 py-2 border rounded-lg cursor-pointer ${
                  selectedIndex === i
                    ? 'bg-amber-900/30 border-amber-500'
                    : 'bg-surface-2 hover:bg-gray-700 border-border'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-200">{appr.skill}</span>
                  <span className="text-xs text-accent font-mono">{formatMod(mod)}</span>
                </div>
                <div className="text-xs text-muted">{t(`game.influenceModal.descs.${appr.descKey}`)}</div>
              </button>
            )
          })}
        </div>

        <div className="text-xs text-gray-500 bg-surface-2 rounded-lg px-3 py-2 mb-4">
          <div className="font-semibold text-muted mb-1">{t('game.influenceModal.npcWillingness')}</div>
          <div className="text-xs">
            <span className="text-green-400">{t('game.influenceModal.willing')}</span>
            {t('game.influenceModal.willingDesc')} &nbsp;|&nbsp;
            <span className="text-yellow-400">{t('game.influenceModal.hesitant')}</span>
            {t('game.influenceModal.hesitantDesc')} &nbsp;|&nbsp;
            <span className="text-red-400">{t('game.influenceModal.unwilling')}</span>
            {t('game.influenceModal.unwillingDesc')}
          </div>
        </div>

        {!result ? (
          <button
            onClick={handleRoll}
            className="w-full px-4 py-3 bg-amber-600 hover:bg-accent-strong text-white font-semibold rounded-lg cursor-pointer text-sm"
          >
            {t('game.influenceModal.roll', { skill: approach.skill, mod: formatMod(modifier) })}
          </button>
        ) : (
          <div className="space-y-3">
            <div
              className={`text-center p-4 rounded-lg border ${
                result.roll === 20
                  ? 'border-green-500 bg-green-900/20'
                  : result.roll === 1
                    ? 'border-red-500 bg-red-900/20'
                    : 'border-border bg-surface-2'
              }`}
            >
              <div className="text-3xl font-bold font-mono mb-1">
                <span
                  className={result.roll === 20 ? 'text-green-400' : result.roll === 1 ? 'text-red-400' : 'text-accent'}
                >
                  {result.total}
                </span>
              </div>
              <div className="text-xs text-muted">
                {t('game.influenceModal.d20Result', { roll: result.roll, mod: formatMod(result.modifier) })}
              </div>
              {result.roll === 20 && (
                <div className="text-sm text-green-400 font-bold mt-1">{t('game.influenceModal.natural20')}</div>
              )}
              {result.roll === 1 && (
                <div className="text-sm text-red-400 font-bold mt-1">{t('game.influenceModal.natural1')}</div>
              )}
            </div>
            <button
              onClick={() => {
                onBroadcastResult(
                  t('game.influenceModal.broadcast', {
                    name: character.name,
                    skill: approach.skill,
                    total: result.total,
                    roll: result.roll,
                    mod: formatMod(result.modifier)
                  })
                )
                onClose()
              }}
              className="w-full px-4 py-2 bg-amber-600 hover:bg-accent-strong text-white font-semibold rounded-lg cursor-pointer text-sm"
            >
              {t('game.influenceModal.done')}
            </button>
          </div>
        )}

        <div className="text-xs text-gray-600 mt-2">{t('game.influenceModal.failedNote')}</div>
      </div>
    </div>
  )
}
