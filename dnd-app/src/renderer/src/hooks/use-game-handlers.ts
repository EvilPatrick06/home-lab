import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import type { ActiveModal } from '../components/game/GameModalDispatcher'
import type { MessageType } from '../network'
import { createCompanionToken } from '../services/character/companion-service'
import { load5eMonsterById } from '../services/data-provider'
import { flushAutoSave } from '../services/io/game-auto-save'
import { saveGameState } from '../services/io/game-state-saver'
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useGameStore } from '../stores/use-game-store'
import type { ChatMessage } from '../stores/use-lobby-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import { useNetworkStore } from '../stores/use-network-store'
import type { Campaign } from '../types/campaign'
import type { Character } from '../types/character'
import { is5eCharacter } from '../types/character'
import type { Companion5e } from '../types/companion'
import type { GameMap } from '../types/map'
import type { MonsterStatBlock } from '../types/monster'
import { logger } from '../utils/logger'

interface UseGameHandlersOptions {
  campaign: Campaign
  isDM: boolean
  character: Character | null
  playerName: string
  activeMap: GameMap | null
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  setActiveModal: (modal: ActiveModal) => void
  setNarrationText: (text: string | null) => void
  setLeaving: (v: boolean) => void
  setLongRestWarning: (v: boolean) => void
  activeTool: 'select' | 'fog-reveal' | 'fog-hide' | 'wall'
  fogBrushSize: number
}

interface UseGameHandlersReturn {
  handleReadAloud: (text: string, style: 'chat' | 'dramatic') => void
  handleLeaveGame: (destination: string) => Promise<void>
  handleSaveCampaign: () => Promise<void>
  handleEndSession: () => void
  getCampaignCharacterIds: () => string[]
  handleShortRest: () => void
  handleLongRest: () => void
  executeLongRest: () => void
  handleRestApply: (restType: 'shortRest' | 'longRest', restoredIds: string[]) => void
  handleCellClick: (gridX: number, gridY: number) => void
  handleAction: (action: string) => void
  handleCompanionSummon: (companion: Omit<Companion5e, 'id' | 'tokenId' | 'createdAt'>) => Promise<void>
  handleWildShapeTransform: (monster: MonsterStatBlock) => void
  handleWildShapeRevert: () => void
  handleWildShapeUseAdjust: (delta: number) => void
  handleOpenShop: () => void
}

export function useGameHandlers({
  campaign,
  isDM,
  character,
  playerName,
  activeMap,
  addChatMessage,
  sendMessage,
  setActiveModal,
  setNarrationText,
  setLeaving,
  setLongRestWarning,
  activeTool,
  fogBrushSize
}: UseGameHandlersOptions): UseGameHandlersReturn {
  const navigate = useNavigate()
  const gameStore = useGameStore()

  const handleReadAloud = useCallback(
    (text: string, style: 'chat' | 'dramatic') => {
      if (style === 'dramatic') {
        sendMessage('dm:narration', { text, style })
        setNarrationText(text)
      } else {
        const chatMsg = {
          id: `narration-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'dm',
          senderName: 'DM (Narration)',
          content: text,
          timestamp: Date.now(),
          isSystem: false
        }
        addChatMessage(chatMsg)
        sendMessage('chat:message', { message: text, isSystem: false })
      }
    },
    [sendMessage, addChatMessage, setNarrationText]
  )

  const handleLeaveGame = async (destination: string): Promise<void> => {
    setLeaving(true)
    try {
      sessionStorage.removeItem(`game-viewMode-${campaign.id}`)
    } catch {
      /* ignore */
    }
    if (isDM) {
      try {
        await saveGameState(campaign)
        await flushAutoSave(campaign.id)
      } catch (err) {
        logger.error('[GameLayout] Save on leave failed:', err)
      }
    }
    useAiDmStore.getState().reset()
    useNetworkStore.getState().disconnect()
    useLobbyStore.getState().reset()
    gameStore.reset()
    // Let React render the leaving spinner before navigating
    setTimeout(() => {
      try {
        navigate(destination)
      } catch (err) {
        logger.error('[GameLayout] Navigation failed:', err)
        window.location.reload()
      }
    }, 0)
  }

  const handleSaveCampaign = async (): Promise<void> => {
    await saveGameState(campaign)
  }

  const handleEndSession = (): void => {
    sendMessage('dm:game-end', {})
    handleLeaveGame('/')
  }

  const getCampaignCharacterIds = (): string[] => {
    const ids: string[] = []
    const allChars = useCharacterStore.getState().characters
    for (const c of allChars) {
      if (c.campaignId === campaign.id) ids.push(c.id)
    }
    const remotes = useLobbyStore.getState().remoteCharacters
    for (const id of Object.keys(remotes)) {
      if (!ids.includes(id)) ids.push(id)
    }
    return ids
  }

  const handleShortRest = (): void => {
    setActiveModal('shortRest')
  }

  const handleLongRest = (): void => {
    const rt = gameStore.restTracking
    const currentTime = gameStore.inGameTime?.totalSeconds ?? 0
    if (rt?.lastLongRestSeconds != null && currentTime - rt.lastLongRestSeconds < 86400) {
      setLongRestWarning(true)
      return
    }
    setActiveModal('longRest')
  }

  const executeLongRest = (): void => {
    setLongRestWarning(false)
    setActiveModal('longRest')
  }

  const handleRestApply = (restType: 'shortRest' | 'longRest', restoredIds: string[]): void => {
    const duration = restType === 'shortRest' ? 3600 : 28800
    const label = restType === 'shortRest' ? 'Short Rest (1 hour)' : 'Long Rest (8 hours)'

    gameStore.advanceTimeSeconds(duration)
    if (restType === 'shortRest') {
      gameStore.setRestTracking({
        lastLongRestSeconds: gameStore.restTracking?.lastLongRestSeconds ?? null,
        lastShortRestSeconds: gameStore.inGameTime?.totalSeconds ?? null
      })
    } else {
      gameStore.setRestTracking({
        lastLongRestSeconds: gameStore.inGameTime?.totalSeconds ?? null,
        lastShortRestSeconds: gameStore.restTracking?.lastShortRestSeconds ?? null
      })
    }

    const msg = `The party takes a ${label}. ${restoredIds.length} character(s) restored.`
    gameStore.addLogEntry(msg)
    addChatMessage({
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'system',
      senderName: 'System',
      content: msg,
      timestamp: Date.now(),
      isSystem: true
    })
    sendMessage('chat:message', { message: msg, isSystem: true })
    sendMessage('dm:time-sync', { totalSeconds: gameStore.inGameTime?.totalSeconds ?? 0 })

    // Check expired light sources
    const expired = gameStore.checkExpiredSources()
    for (const ls of expired) {
      const lsMsg = `${ls.entityName}'s ${ls.sourceName} goes out.`
      addChatMessage({
        id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'system',
        senderName: 'System',
        content: lsMsg,
        timestamp: Date.now(),
        isSystem: true
      })
    }
  }

  const handleCellClick = (gridX: number, gridY: number): void => {
    if (!activeMap) return
    if (activeTool === 'fog-reveal' || activeTool === 'fog-hide') {
      const halfBrush = Math.floor(fogBrushSize / 2)
      const cells: Array<{ x: number; y: number }> = []
      for (let dx = -halfBrush; dx <= halfBrush; dx++) {
        for (let dy = -halfBrush; dy <= halfBrush; dy++) {
          const cx = gridX + dx
          const cy = gridY + dy
          if (cx >= 0 && cy >= 0) {
            cells.push({ x: cx, y: cy })
          }
        }
      }
      if (activeTool === 'fog-reveal') {
        gameStore.revealFog(activeMap.id, cells)
      } else {
        gameStore.hideFog(activeMap.id, cells)
      }
    }
  }

  const handleAction = (action: string): void => {
    if (action === 'attack') {
      setActiveModal('attack')
      return
    }
    if (action === 'help') {
      setActiveModal('help')
      return
    }
    if (action === 'influence') {
      setActiveModal('influence')
      return
    }
    if (action === 'mount') {
      setActiveModal('mount')
      return
    }

    // Turn state effects
    if (character && gameStore.initiative) {
      const entityId = character.id
      switch (action) {
        case 'dash':
          gameStore.setDashing(entityId)
          break
        case 'disengage':
          gameStore.setDisengaging(entityId)
          break
        case 'dodge':
          gameStore.setDodging(entityId)
          break
        case 'hide':
          gameStore.useAction(entityId)
          gameStore.setHidden(entityId, true)
          break
        default:
          gameStore.useAction(entityId)
          break
      }
    }

    addChatMessage({
      id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'system',
      senderName: 'System',
      content: `${playerName} uses ${action.replace(/-/g, ' ')}`,
      timestamp: Date.now(),
      isSystem: true
    })
    sendMessage('chat:message', {
      message: `${playerName} uses ${action.replace(/-/g, ' ')}`,
      isSystem: true
    })
  }

  const handleCompanionSummon = async (companion: Omit<Companion5e, 'id' | 'tokenId' | 'createdAt'>): Promise<void> => {
    if (!character || !is5eCharacter(character) || !activeMap) return
    const newCompanion: Companion5e = {
      ...companion,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    }
    // Save to character
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id)
    if (latest && is5eCharacter(latest)) {
      const updated = {
        ...latest,
        companions: [...(latest.companions ?? []), newCompanion],
        updatedAt: new Date().toISOString()
      }
      useCharacterStore.getState().saveCharacter(updated)
    }
    // Place token on map
    const statBlock = await load5eMonsterById(companion.monsterStatBlockId)
    if (statBlock) {
      const charToken = activeMap.tokens.find((t) => t.entityId === character.id)
      const gx = charToken ? charToken.gridX + charToken.sizeX : 0
      const gy = charToken ? charToken.gridY : 0
      const tokenData = createCompanionToken(newCompanion, statBlock, gx, gy)
      const tokenId = crypto.randomUUID()
      gameStore.addToken(activeMap.id, { ...tokenData, id: tokenId })

      // Add to initiative if combat is active
      const initiative = gameStore.initiative
      if (initiative) {
        const dexMod = Math.floor((statBlock.abilityScores.dex - 10) / 2)
        if (companion.type === 'steed' || companion.type === 'summoned') {
          // Steeds/summoned act on owner's initiative
          const ownerEntry = initiative.entries.find((e) => e.entityId === character.id)
          const ownerTotal = ownerEntry ? ownerEntry.total : 10
          gameStore.addToInitiative({
            id: tokenId,
            entityId: tokenId,
            entityName: companion.name,
            entityType: 'npc',
            roll: ownerTotal - dexMod,
            modifier: dexMod,
            total: ownerTotal,
            isActive: false
          })
        } else {
          // Familiars roll their own initiative
          const roll = Math.floor(Math.random() * 20) + 1
          gameStore.addToInitiative({
            id: tokenId,
            entityId: tokenId,
            entityName: companion.name,
            entityType: 'npc',
            roll,
            modifier: dexMod,
            total: roll + dexMod,
            isActive: false
          })
        }
        gameStore.initTurnState(tokenId, statBlock.speed.walk ?? 0)
      }
    }
  }

  const handleWildShapeTransform = (monster: MonsterStatBlock): void => {
    if (!character || !is5eCharacter(character) || !activeMap) return
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id)
    if (!latest || !is5eCharacter(latest)) return
    const uses = latest.wildShapeUses
    if (!uses || uses.current <= 0) return
    const updated = {
      ...latest,
      wildShapeUses: { ...uses, current: uses.current - 1 },
      activeWildShapeFormId: monster.id,
      updatedAt: new Date().toISOString()
    }
    useCharacterStore.getState().saveCharacter(updated)
    const charToken = activeMap.tokens.find((t) => t.entityId === character.id)
    if (charToken) {
      gameStore.updateToken(activeMap.id, charToken.id, {
        currentHP: monster.hp,
        maxHP: monster.hp,
        ac: monster.ac,
        walkSpeed: monster.speed.walk ?? 0,
        swimSpeed: monster.speed.swim,
        climbSpeed: monster.speed.climb,
        flySpeed: monster.speed.fly
      })
    }
  }

  const handleWildShapeRevert = (): void => {
    if (!character || !is5eCharacter(character) || !activeMap) return
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id)
    if (!latest || !is5eCharacter(latest)) return
    const updated = {
      ...latest,
      activeWildShapeFormId: undefined,
      updatedAt: new Date().toISOString()
    }
    useCharacterStore.getState().saveCharacter(updated)
    const charToken = activeMap.tokens.find((t) => t.entityId === character.id)
    if (charToken) {
      gameStore.updateToken(activeMap.id, charToken.id, {
        currentHP: latest.hitPoints.current,
        maxHP: latest.hitPoints.maximum,
        ac: undefined,
        walkSpeed: undefined,
        swimSpeed: undefined,
        climbSpeed: undefined,
        flySpeed: undefined
      })
    }
  }

  const handleWildShapeUseAdjust = (delta: number): void => {
    if (!character || !is5eCharacter(character)) return
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id)
    if (!latest || !is5eCharacter(latest)) return
    const uses = latest.wildShapeUses
    if (!uses) return
    const newCurrent = Math.max(0, Math.min(uses.max, uses.current + delta))
    const updated = {
      ...latest,
      wildShapeUses: { ...uses, current: newCurrent },
      updatedAt: new Date().toISOString()
    }
    useCharacterStore.getState().saveCharacter(updated)
  }

  const handleOpenShop = (): void => {
    setActiveModal('shop')
  }

  return {
    handleReadAloud,
    handleLeaveGame,
    handleSaveCampaign,
    handleEndSession,
    getCampaignCharacterIds,
    handleShortRest,
    handleLongRest,
    executeLongRest,
    handleRestApply,
    handleCellClick,
    handleAction,
    handleCompanionSummon,
    handleWildShapeTransform,
    handleWildShapeRevert,
    handleWildShapeUseAdjust,
    handleOpenShop
  }
}
