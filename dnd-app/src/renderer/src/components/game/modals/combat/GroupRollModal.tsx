import { useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { rollSingle } from '../../../../services/dice/dice-service'
import { useNetworkStore } from '../../../../stores/network-store'
import { useCharacterStore } from '../../../../stores/use-character-store'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import { SKILL_NAMES_5E } from '../../../../systems/dnd5e/skills'
import { is5eCharacter } from '../../../../types/character'
import { abilityModifier } from '../../../../types/character-common'

interface GroupRollModalProps {
  onClose: () => void
  onBroadcastResult: (message: string) => void
  isDM?: boolean
}

type CheckType = 'ability' | 'save' | 'skill'

const ABILITIES = [
  { value: 'strength', label: 'Strength' },
  { value: 'dexterity', label: 'Dexterity' },
  { value: 'constitution', label: 'Constitution' },
  { value: 'intelligence', label: 'Intelligence' },
  { value: 'wisdom', label: 'Wisdom' },
  { value: 'charisma', label: 'Charisma' }
]

const SKILLS = SKILL_NAMES_5E // PHASE-38: canonical 5e skill names

export default function GroupRollModal({ onClose, onBroadcastResult }: GroupRollModalProps) {
  const { t } = useT()
  const [checkType, setCheckType] = useState<CheckType>('ability')
  const [ability, setAbility] = useState('strength')
  const [skill, setSkill] = useState('Perception')
  const [dc, setDc] = useState(15)
  const [scope, setScope] = useState<'all' | 'selected'>('all')
  const [isSecret, setIsSecret] = useState(false)
  const [requested, setRequested] = useState(false)

  // PHASE-13 13G — live results streamed from the host game store as each player's
  // `player:roll-result` lands (the host-handler calls `addGroupRollResult`). The DM
  // watches them arrive here instead of the old roll-for-everyone-immediately loop.
  const liveResults = useGameStore((s) => s.groupRollResults)
  const lobbyPlayers = useLobbyStore((s) => s.players)
  const connectedPlayers = lobbyPlayers.filter((p) => (p.status ?? 'connected') === 'connected')

  const handleClose = (): void => {
    useGameStore.getState().clearGroupRollResults()
    onClose()
  }
  useEscapeKey(handleClose)

  const getCheckLabel = (): string => {
    if (checkType === 'skill') return t('game.groupRollModal.skillCheck', { skill })
    const abilityLabel = ABILITIES.find((a) => a.value === ability)?.label ?? ability
    return checkType === 'save'
      ? t('game.groupRollModal.savingThrowLabel', { ability: abilityLabel })
      : t('game.groupRollModal.checkLabel', { ability: abilityLabel })
  }

  // The DM's character-modifier helper, reused for the "roll for remaining" fallback so
  // solo/offline/AFK players still get a result (mirrors RollRequestOverlay's own math).
  const computeModifier = (characterId: string | null): number => {
    if (!characterId) return 0
    const char = useCharacterStore.getState().characters.find((c) => c.id === characterId)
    if (!char || !is5eCharacter(char)) return 0
    const profBonus = Math.ceil(char.level / 4) + 1
    if (checkType === 'skill') {
      const sk = char.skills.find((s) => s.name === skill)
      if (!sk) return 0
      const abMod = abilityModifier(char.abilityScores[sk.ability])
      return abMod + (sk.proficient ? profBonus : 0) + (sk.expertise ? profBonus : 0)
    }
    const abMod = abilityModifier(char.abilityScores[ability as keyof typeof char.abilityScores] ?? 10)
    if (checkType === 'save') {
      const proficient = char.proficiencies?.savingThrows?.includes(ability as never)
      return abMod + (proficient ? profBonus : 0)
    }
    return abMod
  }

  // PHASE-13 13G — broadcast a real roll request so every connected player's
  // RollRequestOverlay pops (the already-shipped client path); their results stream back
  // into `groupRollResults`. Mirrors `executeRequestRoll` (effect-actions.ts) exactly.
  const handleRequestRoll = () => {
    setRequested(true)
    const gs = useGameStore.getState()
    gs.clearGroupRollResults()
    const id = crypto.randomUUID()
    const reqAbility = checkType === 'skill' ? undefined : ability
    const reqSkill = checkType === 'skill' ? skill : undefined
    gs.setPendingGroupRoll({ id, type: checkType, ability: reqAbility, skill: reqSkill, dc, scope, isSecret })

    const net = useNetworkStore.getState()
    const localPeerId = net.localPeerId ?? ''
    const requesterName =
      useLobbyStore.getState().players.find((p) => p.peerId === localPeerId)?.displayName ?? 'Dungeon Master'
    net.sendMessage('dm:roll-request', {
      id,
      type: checkType,
      ability: reqAbility,
      skill: reqSkill,
      dc,
      isSecret,
      requesterId: localPeerId,
      requesterName
    })
  }

  // "Roll for remaining": fill in every connected player who hasn't responded yet (and any
  // solo/AFK player) by rolling DM-side with their real modifier. A player counts as
  // responded if a result matches their characterId or display name.
  const respondedIds = new Set(liveResults.map((r) => r.entityId))
  const respondedNames = new Set(liveResults.map((r) => r.entityName))
  const nonResponders = connectedPlayers.filter(
    (p) => !((p.characterId && respondedIds.has(p.characterId)) || respondedNames.has(p.displayName))
  )

  const handleRollForRemaining = () => {
    const gs = useGameStore.getState()
    for (const p of nonResponders) {
      const roll = rollSingle(20)
      const mod = computeModifier(p.characterId)
      const total = roll + mod
      trigger3dDice({ formula: '1d20', rolls: [roll], total, rollerName: p.displayName })
      gs.addGroupRollResult({
        entityId: p.characterId ?? p.peerId,
        entityName: p.displayName,
        roll,
        modifier: mod,
        total,
        success: total >= dc
      })
    }
  }

  const passCount = liveResults.filter((r) => r.success).length
  const totalCount = liveResults.length
  const groupSuccess = totalCount > 0 && passCount >= Math.ceil(totalCount / 2)
  const waitingCount = Math.max(0, connectedPlayers.length - totalCount)

  const handleDone = () => {
    if (liveResults.length > 0) {
      const label = getCheckLabel()
      const passNames = liveResults
        .filter((r) => r.success)
        .map((r) => r.entityName)
        .join(', ')
      const failNames = liveResults
        .filter((r) => !r.success)
        .map((r) => r.entityName)
        .join(', ')
      const summary = t('game.groupRollModal.summary', {
        label,
        dc,
        result: groupSuccess ? t('game.groupRollModal.groupPasses') : t('game.groupRollModal.groupFails'),
        passCount,
        totalCount,
        passed: passNames || t('game.groupRollModal.none'),
        failed: failNames || t('game.groupRollModal.none')
      })
      onBroadcastResult(summary)
    }
    handleClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-accent">{t('game.groupRollModal.title')}</h2>
          <button onClick={handleClose} className="text-muted hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Check Type Tabs */}
          <div className="flex gap-1 bg-surface-2 rounded-lg p-1">
            {[
              { value: 'ability' as CheckType, label: t('game.groupRollModal.abilityCheck') },
              { value: 'save' as CheckType, label: t('game.groupRollModal.savingThrow') },
              { value: 'skill' as CheckType, label: t('game.groupRollModal.skillCheckTab') }
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setCheckType(tab.value)}
                className={`flex-1 text-sm py-2 rounded-md font-medium transition-colors ${
                  checkType === tab.value ? 'bg-amber-600 text-white' : 'text-muted hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Ability / Skill Selector */}
          {checkType === 'skill' ? (
            <div>
              <label className="block text-sm text-muted mb-1">{t('game.groupRollModal.skill')}</label>
              <select
                name="skill"
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
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
              <label className="block text-sm text-muted mb-1">{t('game.groupRollModal.ability')}</label>
              <select
                name="ability"
                value={ability}
                onChange={(e) => setAbility(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
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
              <label className="block text-sm text-muted mb-1">{t('game.groupRollModal.dc')}</label>
              <input
                type="number"
                name="dc"
                min={1}
                max={30}
                value={dc}
                onChange={(e) => setDc(Number(e.target.value))}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-muted mb-1">{t('game.groupRollModal.scope')}</label>
              <select
                name="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as 'all' | 'selected')}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">{t('game.groupRollModal.allPlayers')}</option>
                <option value="selected">{t('game.groupRollModal.selectedPlayers')}</option>
              </select>
            </div>
          </div>

          {/* Secret Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="is-secret"
              checked={isSecret}
              onChange={(e) => setIsSecret(e.target.checked)}
              className="rounded bg-surface-2 border-gray-600 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm text-gray-300">{t('game.groupRollModal.secretRoll')}</span>
          </label>

          {/* Request Button */}
          {!requested && (
            <button
              onClick={handleRequestRoll}
              className="w-full py-2.5 bg-amber-600 hover:bg-accent-strong text-white font-semibold rounded-lg transition-colors text-sm"
            >
              {t('game.groupRollModal.requestRollPrefix')} {getCheckLabel()} {t('game.groupRollModal.dcSuffix', { dc })}
            </button>
          )}

          {/* Live results — stream in as players respond */}
          {requested && (
            <div className="space-y-3">
              {/* Waiting line + roll-for-remaining fallback */}
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-accent">
                  {waitingCount > 0
                    ? t('game.groupRollModal.waitingForPlayers', { count: waitingCount })
                    : t('game.groupRollModal.allResponded')}
                </div>
                {nonResponders.length > 0 && (
                  <button
                    onClick={handleRollForRemaining}
                    className="shrink-0 px-3 py-1.5 bg-surface-2 hover:bg-gray-700 border border-border text-gray-200 text-xs font-medium rounded-lg transition-colors"
                  >
                    {t('game.groupRollModal.rollForRemaining')}
                  </button>
                )}
              </div>

              {totalCount > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-2 text-muted">
                        <th className="text-left px-3 py-2 font-medium">{t('game.groupRollModal.colPlayer')}</th>
                        <th className="text-center px-3 py-2 font-medium">{t('game.groupRollModal.colRoll')}</th>
                        <th className="text-center px-3 py-2 font-medium">{t('game.groupRollModal.colMod')}</th>
                        <th className="text-center px-3 py-2 font-medium">{t('game.groupRollModal.colTotal')}</th>
                        <th className="text-center px-3 py-2 font-medium">{t('game.groupRollModal.colResult')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveResults.map((r) => (
                        <tr key={r.entityId} className="border-t border-gray-800">
                          <td className="px-3 py-2 text-white font-medium">{r.entityName}</td>
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
                          <td className="text-center px-3 py-2 text-muted">
                            {r.modifier >= 0 ? `+${r.modifier}` : r.modifier}
                          </td>
                          <td className="text-center px-3 py-2 text-white font-semibold">{r.total}</td>
                          <td className="text-center px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                r.success ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                              }`}
                            >
                              {r.success ? t('game.groupRollModal.pass') : t('game.groupRollModal.fail')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Group Result — only meaningful once at least one result is in */}
              {totalCount > 0 && (
                <div
                  className={`text-center py-3 rounded-lg border ${
                    groupSuccess
                      ? 'bg-green-900/20 border-green-700 text-green-400'
                      : 'bg-red-900/20 border-red-700 text-red-400'
                  }`}
                >
                  <div className="text-xs text-muted mb-1">
                    {t('game.groupRollModal.groupCheck', { passCount, totalCount })}
                  </div>
                  <div className="text-lg font-bold">
                    {groupSuccess ? t('game.groupRollModal.groupSucceeds') : t('game.groupRollModal.groupFailsResult')}
                  </div>
                </div>
              )}

              <button
                onClick={handleDone}
                className="w-full py-2.5 bg-amber-600 hover:bg-accent-strong text-white font-semibold rounded-lg transition-colors text-sm"
              >
                {t('game.groupRollModal.postResults')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
