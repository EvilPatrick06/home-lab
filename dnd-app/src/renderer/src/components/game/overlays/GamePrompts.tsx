import { useT } from '../../../i18n'
import type { MessageType } from '../../../network'
import { useGameStore } from '../../../stores/use-game-store'
import type { ChatMessage } from '../../../stores/use-lobby-store'
import type { Character } from '../../../types/character'
import { cryptoRollDie } from '../../../utils/crypto-random'

// --- Prompt state types ---
export interface OaPromptState {
  movingTokenLabel: string
  enemyTokenId: string
  enemyTokenLabel: string
  entityId: string
}

export interface StabilizePromptState {
  entityId: string
  entityName: string
  healerName: string
  medicineMod: number
}

export interface ConcCheckPromptState {
  entityId: string
  entityName: string
  spellName: string
  dc: number
  damage: number
}

// --- Opportunity Attack Prompt ---
interface OaPromptProps {
  prompt: OaPromptState
  onDismiss: () => void
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
}

export function OpportunityAttackPrompt({
  prompt,
  onDismiss,
  addChatMessage,
  sendMessage
}: OaPromptProps): JSX.Element {
  const { t } = useT()
  const gameStore = useGameStore()

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-gray-900 border border-amber-500 rounded-xl p-5 w-80 shadow-2xl">
        <h3 className="text-sm font-semibold text-amber-400 mb-2">{t('game.opportunityAttackPrompt.title')}</h3>
        <p className="text-xs text-gray-300 mb-4">
          <span className="text-amber-300 font-semibold">{prompt.movingTokenLabel}</span>{' '}
          {t('game.opportunityAttackPrompt.movingOutOf')}
          <span className="text-red-300 font-semibold"> {prompt.enemyTokenLabel}</span>
          {t('game.opportunityAttackPrompt.reachQuestion', { enemy: prompt.enemyTokenLabel })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              gameStore.useReaction(prompt.entityId)
              addChatMessage({
                id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: `${prompt.enemyTokenLabel} makes an Opportunity Attack against ${prompt.movingTokenLabel}! (Reaction used)`,
                timestamp: Date.now(),
                isSystem: true
              })
              sendMessage('chat:message', {
                message: `${prompt.enemyTokenLabel} makes an Opportunity Attack against ${prompt.movingTokenLabel}! (Reaction used)`,
                isSystem: true
              })
              onDismiss()
            }}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg cursor-pointer"
          >
            {t('game.opportunityAttackPrompt.yesAttack')}
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer"
          >
            {t('game.opportunityAttackPrompt.noPass')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Concentration Check Prompt ---
interface ConcCheckPromptProps {
  prompt: ConcCheckPromptState
  onDismiss: () => void
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  onConcentrationLost: (casterId: string) => void
}

export function ConcentrationCheckPrompt({
  prompt,
  onDismiss,
  addChatMessage,
  sendMessage,
  onConcentrationLost
}: ConcCheckPromptProps): JSX.Element {
  const { t } = useT()
  const gameStore = useGameStore()

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-gray-900 border border-purple-500 rounded-xl p-5 w-96 shadow-2xl">
        <h3 className="text-sm font-semibold text-purple-400 mb-2">{t('game.concentrationCheckPrompt.title')}</h3>
        <p className="text-xs text-gray-300 mb-1">
          <span className="text-purple-300 font-semibold">{prompt.entityName}</span>{' '}
          {t('game.concentrationCheckPrompt.took')}{' '}
          <span className="text-red-300 font-semibold">
            {t('game.concentrationCheckPrompt.damageAmount', { damage: prompt.damage })}
          </span>{' '}
          {t('game.concentrationCheckPrompt.whileConcentratingOn')}{' '}
          <span className="text-blue-300 font-semibold">{prompt.spellName}</span>.
        </p>
        <p className="text-xs text-gray-400 mb-4">
          {t('game.concentrationCheckPrompt.saveRequired')}{' '}
          <span className="text-white font-bold">{t('game.concentrationCheckPrompt.dc', { dc: prompt.dc })}</span>{' '}
          {t('game.concentrationCheckPrompt.dcNote')}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const roll = cryptoRollDie(20)
              const passed = roll >= prompt.dc
              const isCrit = roll === 20
              const isFumble = roll === 1
              const resultText = isCrit
                ? 'Natural 20! Concentration maintained!'
                : isFumble
                  ? 'Natural 1! Concentration lost!'
                  : passed
                    ? `Rolled ${roll} vs DC ${prompt.dc} - Concentration maintained!`
                    : `Rolled ${roll} vs DC ${prompt.dc} - Concentration lost!`

              if (!passed && !isCrit) {
                gameStore.setConcentrating(prompt.entityId, undefined)
                onConcentrationLost(prompt.entityId)
              }

              addChatMessage({
                id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: `${prompt.entityName} CON Save (${prompt.spellName}): ${resultText}`,
                timestamp: Date.now(),
                isSystem: true
              })
              sendMessage('chat:message', {
                message: `${prompt.entityName} CON Save (${prompt.spellName}): ${resultText}`,
                isSystem: true
              })
              onDismiss()
            }}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-lg cursor-pointer"
          >
            {t('game.concentrationCheckPrompt.rollConSave')}
          </button>
          <button
            onClick={() => {
              addChatMessage({
                id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: `${prompt.entityName} maintains concentration on ${prompt.spellName} (manual)`,
                timestamp: Date.now(),
                isSystem: true
              })
              onDismiss()
            }}
            className="px-3 py-2 text-xs font-semibold bg-green-700 hover:bg-green-600 text-white rounded-lg cursor-pointer"
          >
            {t('game.concentrationCheckPrompt.pass')}
          </button>
          <button
            onClick={() => {
              gameStore.setConcentrating(prompt.entityId, undefined)
              onConcentrationLost(prompt.entityId)
              addChatMessage({
                id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: `${prompt.entityName} loses concentration on ${prompt.spellName}!`,
                timestamp: Date.now(),
                isSystem: true
              })
              sendMessage('chat:message', {
                message: `${prompt.entityName} loses concentration on ${prompt.spellName}!`,
                isSystem: true
              })
              onDismiss()
            }}
            className="px-3 py-2 text-xs font-semibold bg-red-700 hover:bg-red-600 text-white rounded-lg cursor-pointer"
          >
            {t('game.concentrationCheckPrompt.fail')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Stabilize Check Prompt ---
interface StabilizePromptProps {
  prompt: StabilizePromptState
  character: Character | null
  onDismiss: () => void
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
}

export function StabilizeCheckPrompt({
  prompt,
  character,
  onDismiss,
  addChatMessage,
  sendMessage
}: StabilizePromptProps): JSX.Element {
  const { t } = useT()
  const gameStore = useGameStore()

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-gray-900 border border-green-500 rounded-xl p-5 w-96 shadow-2xl">
        <h3 className="text-sm font-semibold text-green-400 mb-2">{t('game.stabilizeCheckPrompt.title')}</h3>
        <p className="text-xs text-gray-300 mb-1">
          <span className="text-green-300 font-semibold">{prompt.healerName}</span>{' '}
          {t('game.stabilizeCheckPrompt.attemptsToStabilize')}{' '}
          <span className="text-red-300 font-semibold">{prompt.entityName}</span>{' '}
          {t('game.stabilizeCheckPrompt.zeroHp')}
        </p>
        <p className="text-xs text-gray-400 mb-4">
          {t('game.stabilizeCheckPrompt.medicineCheck')}{' '}
          <span className="text-white font-bold">{t('game.stabilizeCheckPrompt.dc10')}</span>
          <span className="text-gray-500 ml-1">
            {t('game.stabilizeCheckPrompt.modifier', {
              mod: `${prompt.medicineMod >= 0 ? '+' : ''}${prompt.medicineMod}`
            })}
          </span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const roll = cryptoRollDie(20)
              const total = roll + prompt.medicineMod
              const passed = total >= 10
              const resultText =
                roll === 20
                  ? `Natural 20! ${prompt.entityName} is stabilized!`
                  : roll === 1
                    ? `Natural 1! Failed to stabilize ${prompt.entityName}.`
                    : passed
                      ? `Rolled ${total} (${roll}+${prompt.medicineMod}) vs DC 10 — ${prompt.entityName} is stabilized!`
                      : `Rolled ${total} (${roll}+${prompt.medicineMod}) vs DC 10 — Failed to stabilize.`

              if (character && gameStore.initiative) {
                gameStore.useAction(character.id)
              }

              addChatMessage({
                id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: `${prompt.healerName} Medicine Check (Stabilize): ${resultText}`,
                timestamp: Date.now(),
                isSystem: true
              })
              sendMessage('chat:message', {
                message: `${prompt.healerName} Medicine Check (Stabilize): ${resultText}`,
                isSystem: true
              })

              if (passed || roll === 20) {
                const cId = `cond-${Date.now()}`
                gameStore.addCondition({
                  id: cId,
                  entityId: prompt.entityId,
                  entityName: prompt.entityName,
                  condition: 'Stable',
                  duration: 'permanent',
                  source: prompt.healerName,
                  appliedRound: gameStore.round
                })
              }

              onDismiss()
            }}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-green-600 hover:bg-green-500 text-white rounded-lg cursor-pointer"
          >
            {t('game.stabilizeCheckPrompt.rollMedicine', {
              mod: `${prompt.medicineMod >= 0 ? '+' : ''}${prompt.medicineMod}`
            })}
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-2 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer"
          >
            {t('common.actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
