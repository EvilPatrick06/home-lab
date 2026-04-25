import { useCallback } from 'react'
import {
  getEffectiveSpeed,
  isMoveBlockedByFear,
  type MovementType,
  proneStandUpCost,
  triggersOpportunityAttack
} from '../services/combat/combat-rules'
import { checkOpportunityAttack } from '../services/combat/reaction-tracker'
import { processTokenRegionTriggers } from '../services/map/region-detection'
import { buildMapLightSources, debouncedRecomputeVision } from '../services/map/vision-computation'
import { getWeatherEffects, type WeatherType } from '../services/weather-mechanics'
import { useGameStore } from '../stores/use-game-store'
import type { GameMap, TerrainCell } from '../types/map'

interface OaPrompt {
  movingTokenLabel: string
  enemyTokenId: string
  enemyTokenLabel: string
  entityId: string
}

interface ConcCheckPrompt {
  entityId: string
  entityName: string
  spellName: string
  dc: number
  damage: number
}

export interface PortalEntryInfo {
  tokenId: string
  mapId: string
  targetMapId: string
  targetGridX: number
  targetGridY: number
}

interface UseTokenMovementOptions {
  activeMap: GameMap | null
  teleportMove: boolean
  addChatMessage: (msg: {
    id: string
    senderId: string
    senderName: string
    content: string
    timestamp: number
    isSystem: boolean
  }) => void
  setOaPrompt: (prompt: OaPrompt | null) => void
  setConcCheckPrompt: (prompt: ConcCheckPrompt | null) => void
  onPortalEntry?: (portal: PortalEntryInfo) => void
}

interface UseTokenMovementReturn {
  handleTokenMoveWithOA: (tokenId: string, gridX: number, gridY: number) => void
  handleConcentrationLost: (casterId: string) => void
}

function patchTokensForMountedMove(
  tokens: GameMap['tokens'],
  tokenId: string,
  gridX: number,
  gridY: number
): GameMap['tokens'] {
  const movedToken = tokens.find((token) => token.id === tokenId)
  if (!movedToken) {
    return tokens.map((token) => (token.id === tokenId ? { ...token, gridX, gridY } : token))
  }

  return tokens.map((token) =>
    token.id === tokenId || (movedToken.riderId != null && token.entityId === movedToken.riderId)
      ? { ...token, gridX, gridY }
      : token
  )
}

export function useTokenMovement({
  activeMap,
  teleportMove,
  addChatMessage,
  setOaPrompt,
  setConcCheckPrompt: _setConcCheckPrompt,
  onPortalEntry
}: UseTokenMovementOptions): UseTokenMovementReturn {
  const gameStore = useGameStore()

  const handleConcentrationLost = useCallback(
    (casterId: string): void => {
      if (!activeMap) return
      const tokensToRemove = activeMap.tokens.filter(
        (t) => t.companionType === 'summoned' && t.ownerEntityId === casterId
      )
      for (const token of tokensToRemove) {
        gameStore.removeToken(activeMap.id, token.id)
        const initState = gameStore.initiative
        if (initState) {
          const entry = initState.entries.find((e) => e.entityId === token.id)
          if (entry) {
            gameStore.removeFromInitiative(entry.id)
          }
        }
      }
      if (tokensToRemove.length > 0) {
        addChatMessage({
          id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'system',
          senderName: 'System',
          content: `Concentration lost! ${tokensToRemove.map((t) => t.label).join(', ')} disappeared.`,
          timestamp: Date.now(),
          isSystem: true
        })
      }
    },
    [activeMap, gameStore, addChatMessage]
  )

  const handleTokenMoveWithOA = useCallback(
    (tokenId: string, gridX: number, gridY: number): void => {
      if (!activeMap) return

      const movingToken = activeMap.tokens.find((t) => t.id === tokenId)
      if (!movingToken) {
        gameStore.moveToken(activeMap.id, tokenId, gridX, gridY)
        return
      }

      const ts = gameStore.turnStates[movingToken.entityId]
      const isDisengaging = ts?.isDisengaging ?? false
      const moveType: MovementType = teleportMove ? 'teleport' : 'walk'

      // Frightened: cannot move closer to fear source
      if (moveType === 'walk') {
        const entityConditions = gameStore.conditions.filter(
          (c) => c.entityId === movingToken.entityId && c.condition === 'Frightened'
        )
        for (const fc of entityConditions) {
          if (fc.sourceEntityId) {
            const sourceToken = activeMap.tokens.find((t) => t.entityId === fc.sourceEntityId)
            if (
              sourceToken &&
              isMoveBlockedByFear(
                movingToken.gridX,
                movingToken.gridY,
                gridX,
                gridY,
                sourceToken.gridX,
                sourceToken.gridY
              )
            ) {
              addChatMessage({
                id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                senderId: 'system',
                senderName: 'System',
                content: `${movingToken.label} is Frightened and cannot move closer to ${sourceToken.label}!`,
                timestamp: Date.now(),
                isSystem: true
              })
              return
            }
          }
        }
      }

      if (gameStore.initiative && !isDisengaging) {
        const enemies = activeMap.tokens.filter((t) => t.id !== tokenId && t.entityType !== movingToken.entityType)

        // Use reaction-tracker for richer OA prompts with feature awareness
        const cellSizeFt = 5
        const nearbyEnemies = enemies.map((enemy) => ({
          entityId: enemy.entityId,
          entityName: enemy.label,
          x: enemy.gridX,
          y: enemy.gridY,
          reach: 1, // 1 cell = 5ft default reach
          features: enemy.conditions ?? [], // Token conditions as feature stand-in
          isDisengaging: isDisengaging
        }))

        const reactionPrompts = checkOpportunityAttack(
          movingToken.entityId,
          movingToken.gridX,
          movingToken.gridY,
          gridX,
          gridY,
          nearbyEnemies,
          cellSizeFt
        )

        // Also use existing per-token check for the UI prompt
        for (const enemy of enemies) {
          if (triggersOpportunityAttack(movingToken, enemy, gridX, gridY, moveType)) {
            const enemyTs = gameStore.turnStates[enemy.entityId]
            if (!enemyTs || !enemyTs.reactionUsed) {
              setOaPrompt({
                movingTokenLabel: movingToken.label,
                enemyTokenId: enemy.id,
                enemyTokenLabel: enemy.label,
                entityId: enemy.entityId
              })
            }
            break
          }
        }

        // Log any additional reaction prompts from reaction-tracker
        for (const prompt of reactionPrompts) {
          addChatMessage({
            id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            senderId: 'system',
            senderName: 'Combat',
            content: `${prompt.entityName}: ${prompt.triggerDescription} (${prompt.availableReactions.join(', ')})`,
            timestamp: Date.now(),
            isSystem: true
          })
        }
      }

      // Deduct movement from turn state
      if (ts && moveType !== 'teleport') {
        // Controlled mount speed override: effective speed is mount's walkSpeed
        let effectiveSpeed = ts.movementMax
        if (ts.mountedOn && ts.mountType === 'controlled') {
          const mountTk = activeMap.tokens.find((t) => t.id === ts.mountedOn)
          if (mountTk?.walkSpeed) {
            effectiveSpeed = mountTk.walkSpeed
          }
        }

        // Check conditions that reduce or prevent movement (Restrained, Grappled, Exhaustion).
        // Build conditions array from the token's condition list and store conditions (for level-based effects).
        const storeConditions = gameStore.conditions
          .filter((c) => c.entityId === movingToken.entityId)
          .map((c) => ({ name: c.condition, value: c.value }))
        const tokenConditions = movingToken.conditions
          .filter((c) => !storeConditions.some((sc) => sc.name.toLowerCase() === c.toLowerCase()))
          .map((c) => ({ name: c }))
        const allConditions = [...storeConditions, ...tokenConditions]
        const conditionSpeed = getEffectiveSpeed(effectiveSpeed, allConditions)
        if (
          conditionSpeed === 0 &&
          allConditions.some((c) => ['grappled', 'restrained'].includes(c.name.toLowerCase()))
        ) {
          const blocker = allConditions.find((c) => ['grappled', 'restrained'].includes(c.name.toLowerCase()))
          addChatMessage({
            id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            senderId: 'system',
            senderName: 'System',
            content: `${movingToken.label} cannot move — they are ${blocker?.name ?? 'immobilized'}!`,
            timestamp: Date.now(),
            isSystem: true
          })
          return
        }
        // Apply exhaustion speed penalty
        effectiveSpeed = conditionSpeed

        const isProne = movingToken.conditions.some((c) => c.toLowerCase() === 'prone')
        if (isProne && ts.movementRemaining === ts.movementMax) {
          const standCost = proneStandUpCost(effectiveSpeed)
          gameStore.useMovement(movingToken.entityId, standCost)
          const updatedConditions = movingToken.conditions.filter((c) => c.toLowerCase() !== 'prone')
          gameStore.updateToken(activeMap.id, tokenId, { conditions: updatedConditions })
          addChatMessage({
            id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            senderId: 'system',
            senderName: 'System',
            content: `${movingToken.label} stands up from Prone (costs ${standCost} ft of movement)`,
            timestamp: Date.now(),
            isSystem: true
          })
        }

        const dx = Math.abs(gridX - movingToken.gridX)
        const dy = Math.abs(gridY - movingToken.gridY)
        const dist = Math.max(dx, dy) * 5

        const terrain = activeMap.terrain ?? []
        const destTerrain = terrain.find((t) => t.x === gridX && t.y === gridY)
        let actualCost = destTerrain ? dist * destTerrain.movementCost : dist

        // Weather speed modifier: e.g., snow (0.5) makes movement cost 2x
        const weatherPreset = gameStore.weatherOverride?.preset as WeatherType | undefined
        if (weatherPreset) {
          const weatherEffects = getWeatherEffects(weatherPreset)
          if (weatherEffects.speedModifier < 1) {
            actualCost = Math.ceil(actualCost / weatherEffects.speedModifier)
          }
        }

        // Scale cost when using mount's speed (mount speed mapped to rider's budget)
        if (effectiveSpeed !== ts.movementMax && effectiveSpeed > 0) {
          actualCost = Math.round(actualCost * (ts.movementMax / effectiveSpeed))
        }

        gameStore.useMovement(movingToken.entityId, actualCost)
      }

      gameStore.moveToken(activeMap.id, tokenId, gridX, gridY)

      // Auto-reveal fog when dynamic fog is enabled (debounced to avoid perf spikes during drag)
      if (activeMap.fogOfWar.dynamicFogEnabled) {
        const patchedTokens = patchTokensForMountedMove(activeMap.tokens, tokenId, gridX, gridY)
        const lightSources = buildMapLightSources(useGameStore.getState().activeLightSources, patchedTokens)
        debouncedRecomputeVision(
          activeMap,
          ({ visibleCells }) => {
            gameStore.setPartyVisionCells(visibleCells)
            gameStore.addExploredCells(activeMap.id, visibleCells)
          },
          patchedTokens,
          lightSources
        )
      }

      // Terrain hazard damage on entry
      const destTerrain = (activeMap.terrain ?? []).find((t: TerrainCell) => t.x === gridX && t.y === gridY)
      if (destTerrain?.type === 'hazard' && destTerrain.hazardDamage && destTerrain.hazardType) {
        const hazardType = destTerrain.hazardType
        let finalDamage = destTerrain.hazardDamage

        if (movingToken.immunities?.some((i) => i.toLowerCase() === hazardType.toLowerCase())) {
          // Immune — skip damage
          finalDamage = 0
        } else if (movingToken.resistances?.some((r) => r.toLowerCase() === hazardType.toLowerCase())) {
          finalDamage = Math.floor(finalDamage / 2)
        }

        if (finalDamage > 0) {
          gameStore.updateToken(activeMap.id, tokenId, {
            currentHP: Math.max(0, (movingToken.currentHP ?? 0) - finalDamage)
          })
          addChatMessage({
            id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            senderId: 'system',
            senderName: 'System',
            content: `${movingToken.label} takes ${finalDamage} ${hazardType} damage from hazardous terrain!`,
            timestamp: Date.now(),
            isSystem: true
          })
        }
      }

      // Water terrain warning: no swim speed
      if (destTerrain?.type === 'water' && !(movingToken.swimSpeed && movingToken.swimSpeed > 0)) {
        addChatMessage({
          id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'system',
          senderName: 'System',
          content: `${movingToken.label} enters water without swim speed — Athletics check may be required!`,
          timestamp: Date.now(),
          isSystem: true
        })
      }

      // Portal terrain detection
      if (destTerrain?.type === 'portal' && destTerrain.portalTarget && onPortalEntry) {
        onPortalEntry({
          tokenId,
          mapId: activeMap.id,
          targetMapId: destTerrain.portalTarget.mapId,
          targetGridX: destTerrain.portalTarget.gridX,
          targetGridY: destTerrain.portalTarget.gridY
        })
      }

      // Scene region trigger detection
      const regions = activeMap.regions ?? []
      if (regions.length > 0) {
        processTokenRegionTriggers(movingToken, movingToken.gridX, movingToken.gridY, gridX, gridY, regions, {
          token: movingToken,
          mapId: activeMap.id,
          addChatMessage,
          moveToken: gameStore.moveToken,
          updateToken: gameStore.updateToken,
          addCondition: gameStore.addCondition,
          updateRegion: gameStore.updateRegion,
          setActiveMap: gameStore.setActiveMap,
          round: gameStore.round
        })
      }
    },
    [activeMap, gameStore, teleportMove, addChatMessage, setOaPrompt, onPortalEntry]
  )

  return { handleTokenMoveWithOA, handleConcentrationLost }
}
