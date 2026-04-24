import { lazy, Suspense } from 'react'
import type { MessageType } from '../../../network'
import type { GameStoreState } from '../../../stores/game/types'
import { useGameStore } from '../../../stores/use-game-store'
import type { ChatMessage } from '../../../stores/use-lobby-store'
import type { Character } from '../../../types/character'
import type { GameMap } from '../../../types/map'
import type { ActiveModal } from '../active-modal-types'
import { triggerCombatAnimation } from '../map/combat-animations'

const DAMAGE_TYPE_COLORS: Record<string, number> = {
  fire: 0xff6600,
  cold: 0x66ccff,
  lightning: 0xffff00,
  necrotic: 0x9933cc,
  radiant: 0xffffaa,
  poison: 0x22cc55,
  psychic: 0xcc66ff,
  acid: 0x66ff33,
  thunder: 0x4488ff,
  force: 0x88ccff,
  bludgeoning: 0xff4444,
  piercing: 0xff4444,
  slashing: 0xff4444
}

const ActionModal = lazy(() => import('../modals/combat/ActionModal'))
const HiddenDiceModal = lazy(() => import('../modals/combat/HiddenDiceModal'))
const AttackModal = lazy(() => import('../modals/combat/AttackModal'))
const JumpModal = lazy(() => import('../modals/combat/JumpModal'))
const FallingDamageModal = lazy(() => import('../modals/combat/FallingDamageModal'))
const QuickConditionModal = lazy(() => import('../modals/combat/QuickConditionModal'))
const CustomEffectModal = lazy(() => import('../modals/combat/CustomEffectModal'))
const ChaseTrackerModal = lazy(() => import('../modals/combat/ChaseTrackerModal'))
const MobCalculatorModal = lazy(() => import('../modals/combat/MobCalculatorModal'))
const GroupRollModal = lazy(() => import('../modals/combat/GroupRollModal'))

interface CombatModalsProps {
  activeModal: ActiveModal
  close: () => void
  effectiveIsDM: boolean
  character: Character | null
  playerName: string
  isMyTurn: boolean
  handleAction: (action: string) => void
  activeMap: GameMap | null
  broadcast: (message: string) => void
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  setConcCheckPrompt: (
    prompt: {
      entityId: string
      entityName: string
      spellName: string
      dc: number
      damage: number
    } | null
  ) => void
}

function applyTokenDamage(
  gameStore: GameStoreState,
  activeMap: GameMap,
  targetTokenId: string,
  damage: number,
  damageColor = 0xff4444
): { target: GameMap['tokens'][number]; effectiveDamage: number } | null {
  const target = activeMap.tokens.find((t) => t.id === targetTokenId)
  if (!target || target.currentHP == null) return null
  const newHP = Math.max(0, target.currentHP - damage)
  gameStore.updateToken(activeMap.id, targetTokenId, { currentHP: newHP })
  if (damage > 0) {
    const cellSize = activeMap.grid.cellSize
    const px = target.gridX * cellSize + cellSize / 2
    const py = target.gridY * cellSize
    triggerCombatAnimation({
      type: 'floating-text',
      fromX: px,
      fromY: py,
      toX: px,
      toY: py,
      text: `-${damage}`,
      textColor: damageColor
    })
  }
  return { target, effectiveDamage: damage }
}

export default function CombatModals({
  activeModal,
  close,
  effectiveIsDM,
  character,
  playerName,
  isMyTurn,
  handleAction,
  activeMap,
  broadcast,
  addChatMessage,
  sendMessage,
  setConcCheckPrompt
}: CombatModalsProps): JSX.Element {
  const gameStore = useGameStore()

  return (
    <Suspense fallback={null}>
      {activeModal === 'action' && (
        <ActionModal isMyTurn={isMyTurn} playerName={playerName} onAction={handleAction} onClose={close} />
      )}
      {activeModal === 'hiddenDice' && effectiveIsDM && <HiddenDiceModal onClose={close} />}
      {activeModal === 'quickCondition' && <QuickConditionModal onClose={close} />}
      {activeModal === 'attack' && (
        <AttackModal
          character={character}
          tokens={activeMap?.tokens ?? []}
          attackerToken={character ? (activeMap?.tokens.find((t) => t.entityId === character.id) ?? null) : null}
          onClose={close}
          onApplyDamage={(targetTokenId, damage, _damageType, damageAppResult) => {
            if (!activeMap) return
            const effectiveDmg = damageAppResult?.effectiveDamage ?? damage
            const result = applyTokenDamage(
              gameStore,
              activeMap,
              targetTokenId,
              effectiveDmg,
              DAMAGE_TYPE_COLORS[_damageType ?? ''] ?? 0xff4444
            )
            if (result && effectiveDmg > 0) {
              const targetTs = gameStore.turnStates[result.target.entityId]
              if (targetTs?.concentratingSpell) {
                const dc = Math.min(30, Math.max(10, Math.floor(effectiveDmg / 2)))
                setConcCheckPrompt({
                  entityId: result.target.entityId,
                  entityName: result.target.label,
                  spellName: targetTs.concentratingSpell,
                  dc,
                  damage: effectiveDmg
                })
              }
            }
          }}
          onBroadcastResult={broadcast}
        />
      )}
      {activeModal === 'jump' && character && (
        <JumpModal
          character={character}
          movementRemaining={character ? (gameStore.turnStates[character.id]?.movementRemaining ?? 30) : 30}
          onClose={close}
          onBroadcastResult={broadcast}
        />
      )}
      {activeModal === 'falling' && (
        <FallingDamageModal
          tokens={activeMap?.tokens ?? []}
          onClose={close}
          onApplyDamage={(targetTokenId, damage) => {
            if (!activeMap) return
            applyTokenDamage(gameStore, activeMap, targetTokenId, damage)
          }}
          onBroadcastResult={broadcast}
        />
      )}
      {activeModal === 'customEffect' && effectiveIsDM && activeMap && (
        <CustomEffectModal
          tokens={activeMap.tokens}
          onClose={close}
          onBroadcast={(msg) => {
            addChatMessage({
              id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
              senderId: 'system',
              senderName: 'System',
              content: msg,
              timestamp: Date.now(),
              isSystem: true
            })
            sendMessage('chat:message', { message: msg, isSystem: true, senderName: 'System' })
          }}
        />
      )}
      {activeModal === 'chaseTracker' && effectiveIsDM && (
        <ChaseTrackerModal onClose={close} onBroadcastResult={broadcast} />
      )}
      {activeModal === 'mobCalculator' && effectiveIsDM && (
        <MobCalculatorModal onClose={close} onBroadcastResult={broadcast} />
      )}
      {activeModal === 'groupRoll' && (
        <GroupRollModal isDM={effectiveIsDM} onClose={close} onBroadcastResult={broadcast} />
      )}
    </Suspense>
  )
}
