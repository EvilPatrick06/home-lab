import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { rollSingle } from '../../../../services/dice/dice-service'
import { getTokenStats } from '../../../../services/game/token-stats'
import { useGameStore } from '../../../../stores/use-game-store'
import type { Character } from '../../../../types/character'
import type { Character5e } from '../../../../types/character-5e'
import { abilityModifier } from '../../../../types/character-common'
import type { MapToken } from '../../../../types/map'

interface HelpModalProps {
  character: Character
  tokens: MapToken[]
  attackerToken: MapToken | null
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

type HelpMode = 'stabilize' | 'assist-check' | 'assist-attack'

const ASSIST_SKILLS = [
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

export default function HelpModal({
  character,
  tokens,
  attackerToken,
  onClose,
  onBroadcastResult
}: HelpModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const [mode, setMode] = useState<HelpMode | null>(null)
  const [selectedAllyId, setSelectedAllyId] = useState<string | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<string>('Athletics')
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null)
  const [stabilizeResult, setStabilizeResult] = useState<string | null>(null)

  const addCondition = useGameStore((s) => s.addCondition)
  const round = useGameStore((s) => s.round)

  const char5e = character as Character5e
  const profBonus = Math.ceil(character.level / 4) + 1
  const wisMod = abilityModifier(character.abilityScores.wisdom)
  const medSkill = char5e.skills?.find((s) => s.name === 'Medicine')
  const medicineMod = wisMod + (medSkill?.expertise ? profBonus * 2 : medSkill?.proficient ? profBonus : 0)

  // Proficient skills for assist check
  const proficientSkills = ASSIST_SKILLS.filter((skill) => {
    const s = char5e.skills?.find((sk) => sk.name === skill)
    return s?.proficient || s?.expertise
  })

  // Ally tokens (non-enemy, non-self)
  const allyTokens = tokens.filter((t) => attackerToken && t.id !== attackerToken.id && t.entityType !== 'enemy')

  // 0-HP allies for stabilize
  const zeroHpAllies = allyTokens.filter((t) => t.currentHP != null && t.currentHP <= 0)

  // Enemy tokens for assist attack
  const enemyTokens = tokens.filter((t) => attackerToken && t.id !== attackerToken.id && t.entityType === 'enemy')

  const handleStabilize = (): void => {
    const target = zeroHpAllies.find((t) => t.id === selectedAllyId)
    if (!target) return

    const roll = rollSingle(20)
    const total = roll + medicineMod
    trigger3dDice({ formula: '1d20', rolls: [roll], total, rollerName: character.name })
    const passed = total >= 10 || roll === 20
    const modStr = `${medicineMod >= 0 ? '+' : ''}${medicineMod}`
    const resultText =
      roll === 20
        ? t('game.helpModal.stabilizeNat20', { target: target.label })
        : roll === 1
          ? t('game.helpModal.stabilizeNat1', { target: target.label })
          : passed
            ? t('game.helpModal.stabilizePassed', { total, roll, mod: modStr, target: target.label })
            : t('game.helpModal.stabilizeFailed', { total, roll, mod: modStr })

    if (passed) {
      addCondition({
        id: `cond-${Date.now()}`,
        entityId: target.entityId,
        entityName: target.label,
        condition: 'Stable',
        duration: 'permanent',
        source: character.name,
        appliedRound: round
      })
    }

    setStabilizeResult(resultText)
    onBroadcastResult(
      t('game.helpModal.stabilizeBroadcast', { name: character.name, target: target.label, result: resultText })
    )
  }

  const handleAssistCheck = (): void => {
    const ally = allyTokens.find((t) => t.id === selectedAllyId)
    if (!ally) return
    onBroadcastResult(
      t('game.helpModal.assistCheckBroadcast', { name: character.name, ally: ally.label, skill: selectedSkill })
    )
    onClose()
  }

  const handleAssistAttack = (): void => {
    const enemy = enemyTokens.find((t) => t.id === selectedEnemyId)
    if (!enemy) return
    onBroadcastResult(t('game.helpModal.assistAttackBroadcast', { name: character.name, enemy: enemy.label }))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-surface border border-border rounded-xl p-5 w-[420px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">
            {!mode
              ? t('game.helpModal.titleHelpAction')
              : mode === 'stabilize'
                ? t('game.helpModal.titleStabilize')
                : mode === 'assist-check'
                  ? t('game.helpModal.titleAssistCheck')
                  : t('game.helpModal.titleAssistAttack')}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        {/* Mode selection */}
        {!mode && (
          <div className="space-y-2">
            <button
              onClick={() => setMode('stabilize')}
              disabled={zeroHpAllies.length === 0}
              className="w-full text-left px-3 py-2 bg-surface-2 hover:bg-gray-700 border border-green-700/50 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="text-sm font-semibold text-green-300">{t('game.helpModal.titleStabilize')}</div>
              <div className="text-xs text-muted">
                {t('game.helpModal.stabilizeDesc')}
                {zeroHpAllies.length === 0 && (
                  <span className="text-red-400 ml-1">{t('game.helpModal.noZeroHpAllies')}</span>
                )}
              </div>
            </button>
            <button
              onClick={() => setMode('assist-check')}
              disabled={proficientSkills.length === 0}
              className="w-full text-left px-3 py-2 bg-surface-2 hover:bg-gray-700 border border-blue-700/50 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="text-sm font-semibold text-blue-300">{t('game.helpModal.titleAssistCheck')}</div>
              <div className="text-xs text-muted">
                {t('game.helpModal.assistCheckDesc')}
                {proficientSkills.length === 0 && (
                  <span className="text-red-400 ml-1">{t('game.helpModal.noSkillProficiencies')}</span>
                )}
              </div>
            </button>
            <button
              onClick={() => setMode('assist-attack')}
              disabled={enemyTokens.length === 0}
              className="w-full text-left px-3 py-2 bg-surface-2 hover:bg-gray-700 border border-amber-700/50 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="text-sm font-semibold text-amber-300">{t('game.helpModal.titleAssistAttack')}</div>
              <div className="text-xs text-muted">
                {t('game.helpModal.assistAttackDesc')}
                {enemyTokens.length === 0 && <span className="text-red-400 ml-1">{t('game.helpModal.noEnemies')}</span>}
              </div>
            </button>
          </div>
        )}

        {/* Stabilize */}
        {mode === 'stabilize' && !stabilizeResult && (
          <div className="space-y-3">
            <div className="text-xs text-muted mb-2">
              {t('game.helpModal.medicineModifier')}{' '}
              <span className="text-white font-semibold">
                {medicineMod >= 0 ? '+' : ''}
                {medicineMod}
              </span>{' '}
              {t('game.helpModal.vsDc10')}
            </div>
            <div className="space-y-1.5">
              {zeroHpAllies.map((token) => (
                <button
                  key={token.id}
                  onClick={() => {
                    setSelectedAllyId(token.id)
                  }}
                  className={`w-full text-left px-3 py-2 border rounded-lg cursor-pointer ${
                    selectedAllyId === token.id
                      ? 'bg-green-900/30 border-green-500'
                      : 'bg-surface-2 hover:bg-gray-700 border-border'
                  }`}
                >
                  <span className="text-sm text-gray-200">{token.label}</span>
                  <span className="text-xs text-red-400 ml-2">{t('game.helpModal.zeroHp')}</span>
                </button>
              ))}
            </div>
            <button
              onClick={handleStabilize}
              disabled={!selectedAllyId}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('game.helpModal.rollMedicine', { mod: `${medicineMod >= 0 ? '+' : ''}${medicineMod}` })}
            </button>
            <button onClick={() => setMode(null)} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
              {t('game.helpModal.back')}
            </button>
          </div>
        )}
        {mode === 'stabilize' && stabilizeResult && (
          <div className="space-y-3">
            <div className="text-sm text-gray-300 bg-surface-2 rounded-lg px-3 py-2">{stabilizeResult}</div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer text-sm"
            >
              {t('game.helpModal.done')}
            </button>
          </div>
        )}

        {/* Assist Ability Check */}
        {mode === 'assist-check' && (
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted">{t('game.helpModal.skillLabel')}</span>
              <div className="flex gap-1 flex-wrap mt-1">
                {proficientSkills.map((skill) => (
                  <button
                    key={skill}
                    onClick={() => setSelectedSkill(skill)}
                    className={`px-2 py-0.5 text-xs rounded cursor-pointer ${
                      selectedSkill === skill ? 'bg-blue-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted">{t('game.helpModal.allyLabel')}</span>
              <div className="space-y-1 mt-1">
                {allyTokens.map((token) => (
                  <button
                    key={token.id}
                    onClick={() => setSelectedAllyId(token.id)}
                    className={`w-full text-left px-3 py-1.5 border rounded-lg cursor-pointer ${
                      selectedAllyId === token.id
                        ? 'bg-blue-900/30 border-blue-500'
                        : 'bg-surface-2 hover:bg-gray-700 border-border'
                    }`}
                  >
                    <span className="text-sm text-gray-200">{token.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleAssistCheck}
              disabled={!selectedAllyId}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('game.helpModal.grantAdvantageOn', { skill: selectedSkill })}
            </button>
            <button onClick={() => setMode(null)} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
              {t('game.helpModal.back')}
            </button>
          </div>
        )}

        {/* Assist Attack Roll */}
        {mode === 'assist-attack' && (
          <div className="space-y-3">
            <div className="text-xs text-muted mb-1">{t('game.helpModal.chooseEnemy')}</div>
            <div className="space-y-1.5">
              {enemyTokens.map((token) => (
                <button
                  key={token.id}
                  onClick={() => setSelectedEnemyId(token.id)}
                  className={`w-full text-left px-3 py-2 border rounded-lg cursor-pointer ${
                    selectedEnemyId === token.id
                      ? 'bg-amber-900/30 border-amber-500'
                      : 'bg-surface-2 hover:bg-gray-700 border-border'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-200">{token.label}</span>
                    {token.currentHP != null && (
                      <span className="text-xs text-gray-500">
                        {t('game.helpModal.hp', { current: token.currentHP, max: getTokenStats(token).maxHP })}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={handleAssistAttack}
              disabled={!selectedEnemyId}
              className="w-full px-4 py-3 bg-amber-600 hover:bg-accent-strong text-white font-semibold rounded-lg cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('game.helpModal.grantAdvantageVsTarget')}
            </button>
            <button onClick={() => setMode(null)} className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
              {t('game.helpModal.back')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
