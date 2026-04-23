import { useCallback, useState } from 'react'
import { trigger3dDice } from '../../../../components/game/dice3d'
import type { DiceRevealPayload } from '../../../../network'
import type { MonsterStatBlockData } from '../../../../services/data-provider'
import { load5eMonsterById } from '../../../../services/data-provider'
import { rollMultiple, rollSingle } from '../../../../services/dice/dice-service'
import { useCharacterStore } from '../../../../stores/use-character-store'
import { useGameStore } from '../../../../stores/use-game-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../../stores/use-network-store'
import { is5eCharacter } from '../../../../types/character'
import type { Character5e } from '../../../../types/character-5e'
import type { MonsterAction, MonsterStatBlock } from '../../../../types/monster'

type _MonsterStatBlockData = MonsterStatBlockData

import RollerEntityBlock from './RollerEntityBlock'
import RollerQuickDice, { type QuickRollResult } from './RollerQuickDice'

interface DMRollerModalProps {
  onClose: () => void
  onMinimize?: () => void
  onRestore?: () => void
}

interface RollResult {
  id: string
  entityName: string
  label: string
  roll: number
  modifier: number
  total: number
  formula: string
  timestamp: number
}

type EntityType = 'pc' | 'enemy' | 'ally'

interface EntityOption {
  id: string
  name: string
  type: EntityType
  characterData?: Character5e
  monsterData?: MonsterStatBlock
}

export default function DMRollerModal({ onClose, onMinimize, onRestore }: DMRollerModalProps): JSX.Element {
  const [minimized, setMinimized] = useState(false)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [rollResults, setRollResults] = useState<RollResult[]>([])
  const [loadedMonsters, setLoadedMonsters] = useState<Record<string, MonsterStatBlock>>({})

  const activeMapId = useGameStore((s) => s.activeMapId)
  const maps = useGameStore((s) => s.maps)
  const activeMap = maps.find((m) => m.id === activeMapId)
  const characters = useCharacterStore((s) => s.characters)
  const remoteCharacters = useLobbyStore((s) => s.remoteCharacters)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)
  const sendMessage = useNetworkStore((s) => s.sendMessage)

  // Build entity list
  const entities: EntityOption[] = []

  for (const c of characters) {
    if (is5eCharacter(c)) {
      entities.push({ id: c.id, name: c.name, type: 'pc', characterData: c })
    }
  }
  for (const [id, c] of Object.entries(remoteCharacters)) {
    if (is5eCharacter(c) && !entities.find((e) => e.id === id)) {
      entities.push({ id, name: c.name, type: 'pc', characterData: c as Character5e })
    }
  }

  if (activeMap) {
    for (const token of activeMap.tokens) {
      if (entities.find((e) => e.id === token.entityId)) continue
      const type: EntityType = token.entityType === 'enemy' ? 'enemy' : 'ally'
      entities.push({ id: token.entityId, name: token.label, type, monsterData: undefined })
    }
  }

  const selectedEntity = entities.find((e) => e.id === selectedEntityId) ?? null

  // Load monster stat block on demand
  const loadMonster = useCallback(
    async (entityId: string) => {
      if (loadedMonsters[entityId]) return
      const token = activeMap?.tokens.find((t) => t.entityId === entityId)
      if (!token?.monsterStatBlockId) return
      const monster = await load5eMonsterById(token.monsterStatBlockId)
      if (monster) {
        setLoadedMonsters((prev) => ({ ...prev, [entityId]: monster }))
      }
    },
    [activeMap, loadedMonsters]
  )

  const handleSelectEntity = (id: string): void => {
    setSelectedEntityId(id)
    const entity = entities.find((e) => e.id === id)
    if (entity && !entity.characterData && !loadedMonsters[id]) {
      loadMonster(id)
    }
  }

  // Temporarily minimize modal so 3D dice are visible, then restore
  const autoMinimize = useCallback(() => {
    setMinimized(true)
    onMinimize?.()
    setTimeout(() => {
      setMinimized(false)
      onRestore?.()
    }, 3000)
  }, [onMinimize, onRestore])

  // Roll helper
  const doRoll = useCallback(
    (entityName: string, label: string, modifier: number): void => {
      const roll = rollSingle(20)
      const total = roll + modifier
      const formula = `1d20${modifier >= 0 ? '+' : ''}${modifier}`

      autoMinimize()
      trigger3dDice({ formula, rolls: [roll], total, rollerName: 'DM' })

      setRollResults((prev) =>
        [
          {
            id: `roll-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
            entityName,
            label,
            roll,
            modifier,
            total,
            formula,
            timestamp: Date.now()
          },
          ...prev
        ].slice(0, 50)
      )
    },
    [autoMinimize]
  )

  // Roll damage
  const doDamageRoll = useCallback(
    (entityName: string, action: MonsterAction): void => {
      if (!action.damageDice) return
      const match = action.damageDice.match(/^(\d+)d(\d+)([+-]\d+)?$/)
      if (!match) return
      const count = parseInt(match[1], 10)
      const sides = parseInt(match[2], 10)
      const mod = match[3] ? parseInt(match[3], 10) : 0
      const rolls = rollMultiple(count, sides)
      const total = rolls.reduce((s, r) => s + r, 0) + mod

      autoMinimize()
      trigger3dDice({ formula: action.damageDice, rolls, total, rollerName: 'DM' })

      setRollResults((prev) =>
        [
          {
            id: `roll-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
            entityName,
            label: `${action.name} Damage`,
            roll: total,
            modifier: 0,
            total,
            formula: `${action.damageDice} [${rolls.join(',')}]${mod ? ` ${mod >= 0 ? '+' : ''}${mod}` : ''} = ${total} ${action.damageType ?? ''}`,
            timestamp: Date.now()
          },
          ...prev
        ].slice(0, 50)
      )
    },
    [autoMinimize]
  )

  // Reveal to chat + network
  const revealResult = useCallback(
    (result: RollResult) => {
      addChatMessage({
        id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'dm',
        senderName: 'DM',
        content: `${result.entityName} ${result.label}: ${result.formula} = ${result.total}`,
        timestamp: Date.now(),
        isSystem: false,
        isDiceRoll: true,
        diceResult: { formula: result.formula, rolls: [result.roll], total: result.total }
      })

      const revealPayload: DiceRevealPayload = {
        formula: result.formula,
        rolls: [result.roll],
        total: result.total,
        rollerName: 'DM',
        label: `${result.entityName} ${result.label}`
      }
      sendMessage('game:dice-reveal', revealPayload)
    },
    [addChatMessage, sendMessage]
  )

  // Reveal quick roll result
  const revealQuickResult = useCallback(
    (qr: QuickRollResult) => {
      addChatMessage({
        id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'dm',
        senderName: 'DM',
        content: `${qr.label}: [${qr.rolls.join(', ')}] = ${qr.total}`,
        timestamp: Date.now(),
        isSystem: false,
        isDiceRoll: true,
        diceResult: { formula: qr.formula, rolls: qr.rolls, total: qr.total }
      })

      sendMessage('game:dice-reveal', {
        formula: qr.formula,
        rolls: qr.rolls,
        total: qr.total,
        rollerName: 'DM',
        label: qr.label
      })
    },
    [addChatMessage, sendMessage]
  )

  const monsterData = selectedEntity?.monsterData ?? (selectedEntityId ? loadedMonsters[selectedEntityId] : null)

  if (minimized) {
    return <></>
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-3xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-purple-300">DM Roller</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Quick Roll Section */}
        <RollerQuickDice autoMinimize={autoMinimize} onRevealQuickResult={revealQuickResult} />

        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left: Entity selector + stat block */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Entity dropdown */}
            <select
              value={selectedEntityId ?? ''}
              onChange={(e) => handleSelectEntity(e.target.value)}
              className="w-full mb-3 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-xs focus:outline-none focus:border-purple-500"
            >
              <option value="">Select an entity...</option>
              {entities.filter((e) => e.type === 'pc').length > 0 && (
                <optgroup label="PCs">
                  {entities
                    .filter((e) => e.type === 'pc')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </optgroup>
              )}
              {entities.filter((e) => e.type === 'enemy').length > 0 && (
                <optgroup label="Enemies">
                  {entities
                    .filter((e) => e.type === 'enemy')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </optgroup>
              )}
              {entities.filter((e) => e.type === 'ally').length > 0 && (
                <optgroup label="Allies/NPCs">
                  {entities
                    .filter((e) => e.type === 'ally')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>

            {/* Stat block */}
            <div className="flex-1 overflow-y-auto">
              {!selectedEntity && (
                <p className="text-xs text-gray-500 text-center py-8">
                  Select an entity to view its stat block and roll dice.
                </p>
              )}
              {selectedEntity && (
                <RollerEntityBlock
                  characterData={selectedEntity.characterData}
                  monsterData={!selectedEntity.characterData ? monsterData : null}
                  onRoll={doRoll}
                  onDamageRoll={doDamageRoll}
                />
              )}
            </div>
          </div>

          {/* Right: Roll results */}
          <div className="w-64 shrink-0 flex flex-col min-h-0 border-l border-gray-700/50 pl-3">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Roll History</div>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {rollResults.length === 0 ? (
                <p className="text-[10px] text-gray-600 text-center py-4">No rolls yet</p>
              ) : (
                rollResults.map((r) => (
                  <div key={r.id} className="bg-gray-800/50 rounded p-1.5">
                    <div className="text-[10px] text-gray-300">
                      <span className="text-purple-300 font-semibold">{r.entityName}</span> {r.label}:{' '}
                      <span className="text-amber-300 font-bold">{r.total}</span>
                    </div>
                    <div className="text-[9px] text-gray-500">{r.formula}</div>
                    <div className="flex gap-1 mt-0.5">
                      <button
                        onClick={() => revealResult(r)}
                        className="text-[8px] px-1 py-0.5 bg-green-600/30 text-green-400 rounded cursor-pointer hover:bg-green-600/50"
                      >
                        Reveal
                      </button>
                      <button
                        onClick={() => {
                          // Keep hidden -- just acknowledge
                        }}
                        className="text-[8px] px-1 py-0.5 bg-gray-700/50 text-gray-500 rounded cursor-pointer"
                      >
                        Hidden
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {rollResults.length > 0 && (
              <button
                onClick={() => setRollResults([])}
                className="mt-1 text-[9px] text-gray-600 hover:text-red-400 cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
