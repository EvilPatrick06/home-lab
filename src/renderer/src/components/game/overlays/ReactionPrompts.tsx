import { useEffect, useRef, useState } from 'react'
import type { MessageType } from '../../../network'
import type { ReactionPromptState } from '../../../stores/game/types'

type _ReactionPromptState = ReactionPromptState

import { useGameStore } from '../../../stores/use-game-store'
import type { ChatMessage } from '../../../stores/use-lobby-store'

const AUTO_DISMISS_MS = 10_000

// --- Shield Reaction Prompt ---

export interface ShieldPromptState {
  entityId: string
  entityName: string
  currentAC: number
  attackRoll: number
  attackerName: string
}

interface ShieldPromptProps {
  prompt: ShieldPromptState
  onDismiss: () => void
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
}

export function ShieldReactionPrompt({
  prompt,
  onDismiss,
  addChatMessage,
  sendMessage
}: ShieldPromptProps): JSX.Element {
  const gameStore = useGameStore.getState()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS / 1000)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS)
    const interval = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => {
      clearTimeout(timerRef.current)
      clearInterval(interval)
    }
  }, [])

  const shieldedAC = prompt.currentAC + 5

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-gray-900 border border-cyan-500 rounded-xl p-5 w-96 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-cyan-400">Shield Reaction</h3>
          <span className="text-[10px] text-gray-500">{remaining}s</span>
        </div>
        <p className="text-xs text-gray-300 mb-4">
          <span className="text-red-300 font-semibold">{prompt.attackerName}</span> rolled{' '}
          <span className="text-white font-bold">{prompt.attackRoll}</span> to hit{' '}
          <span className="text-cyan-300 font-semibold">{prompt.entityName}</span> (AC{' '}
          <span className="text-white font-bold">{prompt.currentAC}</span>).
          <br />
          Cast <span className="text-cyan-300 font-semibold">Shield</span>? (+5 AC ={' '}
          <span className="text-white font-bold">{shieldedAC}</span>)
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              gameStore.useReaction(prompt.entityId)
              const blocked = prompt.attackRoll < shieldedAC
              addChatMessage({
                id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: `${prompt.entityName} casts Shield! (AC ${prompt.currentAC} -> ${shieldedAC}). Attack roll ${prompt.attackRoll} ${blocked ? 'misses' : 'still hits'}!`,
                timestamp: Date.now(),
                isSystem: true
              })
              sendMessage('chat:message', {
                message: `${prompt.entityName} casts Shield! (AC ${prompt.currentAC} -> ${shieldedAC}). Attack roll ${prompt.attackRoll} ${blocked ? 'misses' : 'still hits'}!`,
                isSystem: true
              })
              onDismiss()
            }}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg cursor-pointer"
          >
            Cast Shield
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer"
          >
            No
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Counterspell Reaction Prompt ---

export interface CounterspellPromptState {
  entityId: string
  entityName: string
  casterName: string
  spellName: string
  spellLevel: number
  highestSlotAvailable: number
}

interface CounterspellPromptProps {
  prompt: CounterspellPromptState
  onDismiss: () => void
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
}

export function CounterspellReactionPrompt({
  prompt,
  onDismiss,
  addChatMessage,
  sendMessage
}: CounterspellPromptProps): JSX.Element {
  const gameStore = useGameStore.getState()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS / 1000)
  const [selectedSlot, setSelectedSlot] = useState(Math.max(3, prompt.spellLevel))
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS)
    const interval = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => {
      clearTimeout(timerRef.current)
      clearInterval(interval)
    }
  }, [])

  const autoSuccess = selectedSlot >= prompt.spellLevel
  const slotOptions: number[] = []
  for (let i = 3; i <= prompt.highestSlotAvailable; i++) slotOptions.push(i)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-gray-900 border border-violet-500 rounded-xl p-5 w-96 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-violet-400">Counterspell</h3>
          <span className="text-[10px] text-gray-500">{remaining}s</span>
        </div>
        <p className="text-xs text-gray-300 mb-3">
          <span className="text-red-300 font-semibold">{prompt.casterName}</span> is casting{' '}
          <span className="text-violet-300 font-semibold">{prompt.spellName}</span> (level{' '}
          <span className="text-white font-bold">{prompt.spellLevel}</span>)!
        </p>

        {slotOptions.length > 1 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Slot Level</span>
            <div className="flex gap-1">
              {slotOptions.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setSelectedSlot(lvl)}
                  className={`w-7 h-7 text-xs font-bold rounded-lg cursor-pointer ${
                    selectedSlot === lvl ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-500 mb-3">
          {autoSuccess
            ? 'Auto-success: slot level >= spell level.'
            : `Requires DC ${10 + prompt.spellLevel} ability check to counter.`}
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => {
              gameStore.useReaction(prompt.entityId)
              let resultText: string
              if (autoSuccess) {
                resultText = `${prompt.entityName} counters ${prompt.casterName}'s ${prompt.spellName} with a level ${selectedSlot} Counterspell!`
              } else {
                const roll = Math.floor(Math.random() * 20) + 1
                const dc = 10 + prompt.spellLevel
                const success = roll >= dc || roll === 20
                resultText = success
                  ? `${prompt.entityName} counters ${prompt.casterName}'s ${prompt.spellName}! (Rolled ${roll} vs DC ${dc})`
                  : `${prompt.entityName}'s Counterspell fails against ${prompt.casterName}'s ${prompt.spellName}. (Rolled ${roll} vs DC ${dc})`
              }
              addChatMessage({
                id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: resultText,
                timestamp: Date.now(),
                isSystem: true
              })
              sendMessage('chat:message', { message: resultText, isSystem: true })
              onDismiss()
            }}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg cursor-pointer"
          >
            Cast Counterspell
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 px-3 py-2 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg cursor-pointer"
          >
            No
          </button>
        </div>
      </div>
    </div>
  )
}
