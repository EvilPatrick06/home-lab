import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useGameEffects } from '../../hooks/use-game-effects'
import { useGameHandlers } from '../../hooks/use-game-handlers'
import { useGameNetwork } from '../../hooks/use-game-network'
import { useGameShortcuts } from '../../hooks/use-game-shortcuts'
import type { PortalEntryInfo } from '../../hooks/use-token-movement'
import { useTokenMovement } from '../../hooks/use-token-movement'
import { executeMacro } from '../../services/macro-engine'
import { buildMapLightSources, hasDarkvision, recomputeVision } from '../../services/map/vision-computation'
import { useAiDmStore } from '../../stores/use-ai-dm-store'
import { useCharacterStore } from '../../stores/use-character-store'
import { useGameStore } from '../../stores/use-game-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useMacroStore } from '../../stores/use-macro-store'
import { useNetworkStore } from '../../stores/use-network-store'
import type { Campaign } from '../../types/campaign'
import type { Character } from '../../types/character'
import { is5eCharacter } from '../../types/character'
import type { MapToken } from '../../types/map'
import { getBuilderCreatePath } from '../../utils/character-routes'
import { processDawnRecharge } from '../../utils/dawn-recharge'
import { ErrorBoundary, ModalErrorBoundary } from '../ui'
import { announce } from '../ui/ScreenReaderAnnouncer'
import DMBottomBar from './bottom/DMBottomBar'
import PlayerBottomBar from './bottom/PlayerBottomBar'
import { DiceOverlay } from './dice3d'
import DiceTray from './dice3d/DiceTray'
import type { ActiveModal } from './GameModalDispatcher'
import GameModalDispatcher from './GameModalDispatcher'

const CharacterInspectModal = lazy(() => import('./modals/utility/CharacterInspectModal'))

import { getWeatherEffects, type WeatherType } from '../../services/weather-mechanics'

import type { AoEConfig } from './map/aoe-overlay'
import MapCanvas from './map/MapCanvas'
import ActionEconomyBar from './overlays/ActionEconomyBar'
import ClockOverlay from './overlays/ClockOverlay'
import DmAlertTray from './overlays/DmAlertTray'

import EmptyCellContextMenu from './overlays/EmptyCellContextMenu'
import {
  type ConcCheckPromptState,
  ConcentrationCheckPrompt,
  type OaPromptState,
  OpportunityAttackPrompt,
  StabilizeCheckPrompt,
  type StabilizePromptState
} from './overlays/GamePrompts'
import {
  AoEDismissButton,
  DrawingToolbar,
  FogToolbar,
  LongRestWarning,
  PhaseChangeToast,
  RestRequestToast,
  TimeRequestToast,
  WallToolbar
} from './overlays/GameToasts'
import Hotbar from './overlays/Hotbar'
import InitiativeOverlay from './overlays/InitiativeOverlay'
import LairActionPrompt from './overlays/LairActionPrompt'
import PlayerHUDOverlay from './overlays/PlayerHUDOverlay'
import PortalPrompt from './overlays/PortalPrompt'
import {
  type CounterspellPromptState,
  CounterspellReactionPrompt,
  type ShieldPromptState,
  ShieldReactionPrompt
} from './overlays/ReactionPrompts'
import RollRequestOverlay from './overlays/RollRequestOverlay'
import SettingsDropdown from './overlays/SettingsDropdown'
import TimerOverlay from './overlays/TimerOverlay'
import TokenContextMenu from './overlays/TokenContextMenu'
import TurnNotificationBanner from './overlays/TurnNotificationBanner'
import ViewModeToggle from './overlays/ViewModeToggle'
import { CharacterMiniSheet, ConditionTracker, PlayerHUD, ShopView, SpellSlotTracker } from './player'
import ResizeHandle from './ResizeHandle'
import LeftSidebar from './sidebar/LeftSidebar'

const CharacterPickerOverlay = lazy(() => import('./overlays/CharacterPickerOverlay'))
const DMMapEditor = lazy(() => import('./modals/dm-tools/DMMapEditor'))
const RulingApprovalModal = lazy(() => import('./modals/utility/RulingApprovalModal'))
const NarrationOverlay = lazy(() => import('./overlays/NarrationOverlay'))

interface GameLayoutProps {
  campaign: Campaign
  isDM: boolean
  character: Character | null
  playerName: string
}

function InspectModalRenderer(): JSX.Element | null {
  const inspectedCharacterData = useGameStore((s) => s.inspectedCharacterData)
  const clearInspectedCharacter = useGameStore((s) => s.clearInspectedCharacter)
  if (!inspectedCharacterData) return null
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>
        <CharacterInspectModal characterData={inspectedCharacterData} onClose={clearInspectedCharacter} />
      </Suspense>
    </ErrorBoundary>
  )
}

export default function GameLayout({ campaign, isDM, character, playerName }: GameLayoutProps): JSX.Element {
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editMapMode, setEditMapMode] = useState(false)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mapKey, setMapKey] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [bottomBarHeight, setBottomBarHeight] = useState(() => {
    try {
      return parseInt(localStorage.getItem('dnd-vtt-bottom-bar-height') || '320', 10)
    } catch {
      return 320
    }
  })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem('dnd-vtt-sidebar-width') || '280', 10)
    } catch {
      return 280
    }
  })
  const prevBottomHeight = useRef(320)
  const prevSidebarWidth = useRef(280)
  const [teleportMove, _setTeleportMove] = useState(false)
  const [activeAoE, setActiveAoE] = useState<AoEConfig | null>(null)
  const [viewMode, setViewModeRaw] = useState<'dm' | 'player'>(() => {
    try {
      const saved = sessionStorage.getItem(`game-viewMode-${campaign.id}`)
      return saved === 'player' ? 'player' : 'dm'
    } catch {
      return 'dm'
    }
  })
  const setViewMode = useCallback(
    (mode: 'dm' | 'player') => {
      setViewModeRaw(mode)
      try {
        sessionStorage.setItem(`game-viewMode-${campaign.id}`, mode)
      } catch {
        /* ignore */
      }
    },
    [campaign.id]
  )
  const [showCharacterPicker, setShowCharacterPicker] = useState(false)
  const [activeTool, setActiveTool] = useState<'select' | 'fog-reveal' | 'fog-hide' | 'wall' | 'draw-free' | 'draw-line' | 'draw-rect' | 'draw-circle' | 'draw-text'>('select')
  const [fogBrushSize, setFogBrushSize] = useState(1)
  const [wallType, setWallType] = useState<'solid' | 'door' | 'window'>('solid')
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(3)
  const [drawingColor, setDrawingColor] = useState('#ffffff')
  const [timeRequestToast, setTimeRequestToast] = useState<{ requesterId: string; requesterName: string } | null>(null)
  const [phaseChangeToast, setPhaseChangeToast] = useState<{
    phase: string
    suggestedLight: 'bright' | 'dim' | 'darkness'
  } | null>(null)
  const [longRestWarning, setLongRestWarning] = useState(false)
  const [restRequestToast, setRestRequestToast] = useState<{ playerName: string; restType: 'short' | 'long' } | null>(
    null
  )
  const [disputeContext, setDisputeContext] = useState<{ ruling: string; citation: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; token: MapToken; mapId: string; selectedTokenIds: string[] } | null>(null)
  const [emptyCellMenu, setEmptyCellMenu] = useState<{
    gridX: number
    gridY: number
    screenX: number
    screenY: number
  } | null>(null)
  const [editingToken, setEditingToken] = useState<{ token: MapToken; mapId: string } | null>(null)
  const [viewingHandout, setViewingHandout] = useState<import('../../types/game-state').Handout | null>(null)
  const [narrationText, setNarrationText] = useState<string | null>(null)
  const [oaPrompt, setOaPrompt] = useState<OaPromptState | null>(null)
  const [stabilizePrompt, setStabilizePrompt] = useState<StabilizePromptState | null>(null)
  const [concCheckPrompt, setConcCheckPrompt] = useState<ConcCheckPromptState | null>(null)
  const [turnBanner, setTurnBanner] = useState<{ entityName: string } | null>(null)
  const [shieldPrompt, setShieldPrompt] = useState<ShieldPromptState | null>(null)
  const [counterspellPrompt, setCounterspellPrompt] = useState<CounterspellPromptState | null>(null)
  const [showCompactHUD, _setShowCompactHUD] = useState(false)
  const [groupConditionEntities, setGroupConditionEntities] = useState<string[] | null>(null)
  const [pendingPortal, setPendingPortal] = useState<PortalEntryInfo | null>(null)
  const prevEntityIdRef = useRef<string | null>(null)

  const gameStore = useGameStore()
  const networkRole = useNetworkStore((s) => s.role)
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)
  const lobbyPeerId = useNetworkStore((s) => s.localPeerId)
  const lobbyDisplayName = useLobbyStore((s) => {
    const localId = useNetworkStore.getState().localPeerId
    return s.players.find((p) => p.peerId === localId)?.displayName ?? null
  })
  const aiDmStore = useAiDmStore()
  const aiInitRef = useRef(false)
  const allCharacters = useCharacterStore((s) => s.characters)

  const handleCreateCharacter = useCallback(() => {
    navigate(getBuilderCreatePath())
  }, [navigate])

  const handleBottomResize = useCallback((delta: number) => {
    setBottomBarHeight((h) => {
      const newH = Math.max(160, Math.min(window.innerHeight * 0.6, h - delta))
      localStorage.setItem('dnd-vtt-bottom-bar-height', String(newH))
      return newH
    })
  }, [])
  const handleBottomDoubleClick = useCallback(() => {
    if (bottomCollapsed) {
      setBottomCollapsed(false)
      setBottomBarHeight(prevBottomHeight.current)
    } else {
      prevBottomHeight.current = bottomBarHeight
      setBottomCollapsed(true)
    }
  }, [bottomCollapsed, bottomBarHeight])
  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => {
      const newW = Math.max(200, Math.min(500, w + delta))
      localStorage.setItem('dnd-vtt-sidebar-width', String(newW))
      return newW
    })
  }, [])
  const handleSidebarDoubleClick = useCallback(() => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false)
      setSidebarWidth(prevSidebarWidth.current)
    } else {
      prevSidebarWidth.current = sidebarWidth
      setSidebarCollapsed(true)
    }
  }, [sidebarCollapsed, sidebarWidth])

  const handleLinkClick = useCallback((category: string, name: string) => {
    // For now, just open the compendium modal
    // TODO: Could enhance to pre-select the specific item
    setActiveModal('compendium')
  }, [])

  const effectiveIsDM = isDM && viewMode === 'dm'
  const activeMap = gameStore.maps.find((m) => m.id === gameStore.activeMapId) ?? null
  const playerConditions = character ? gameStore.conditions.filter((c) => c.entityId === character.id) : []
  const isMyTurn = (() => {
    if (!gameStore.initiative || !character) return false
    return gameStore.initiative.entries[gameStore.initiative.currentIndex]?.entityId === character.id
  })()

  // Current active entity in initiative
  const currentInitEntity = (() => {
    const idx = gameStore.initiative?.currentIndex ?? -1
    return idx >= 0 ? (gameStore.initiative?.entries[idx] ?? null) : null
  })()

  // Detect turn changes and show banner
  useEffect(() => {
    if (!currentInitEntity) {
      prevEntityIdRef.current = null
      return
    }
    if (currentInitEntity.entityId === prevEntityIdRef.current) return
    prevEntityIdRef.current = currentInitEntity.entityId

    // Show banner for player's own character or DM's NPC/enemy
    if (character && currentInitEntity.entityId === character.id) {
      setTurnBanner({ entityName: character.name })
      announce(`It is now ${character.name}'s turn`)
    } else if (isDM && currentInitEntity.entityType !== 'player') {
      setTurnBanner({ entityName: currentInitEntity.entityName })
      announce(`It is now ${currentInitEntity.entityName}'s turn`)
    }
  }, [currentInitEntity, character, isDM])

  const handleEndTurn = useCallback(() => {
    if (!currentInitEntity) return
    if (networkRole === 'client' && character) {
      sendMessage('player:turn-end', { entityId: character.id })
    } else {
      gameStore.nextTurn()
      if (networkRole === 'host') {
        sendMessage('game:turn-advance', {})
      }
    }
  }, [currentInitEntity, networkRole, character, sendMessage, gameStore])

  // Load/save macros for current character
  useEffect(() => {
    if (character?.id) {
      useMacroStore.getState().loadForCharacter(character.id)
    }
    return () => {
      if (character?.id) useMacroStore.getState().saveForCharacter(character.id)
    }
  }, [character?.id])

  const handleExecuteMacro = useCallback(
    (macro: import('../../stores/use-macro-store').Macro) => {
      const char5e = character && is5eCharacter(character) ? character : null
      const addSysMsg = (content: string): void => {
        addChatMessage({
          id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'system',
          senderName: 'System',
          content,
          timestamp: Date.now(),
          isSystem: true
        })
      }
      const ctx = {
        isDM: effectiveIsDM,
        playerName,
        character: char5e,
        localPeerId: lobbyPeerId || 'local',
        addSystemMessage: addSysMsg,
        broadcastSystemMessage: (content: string) => {
          addSysMsg(content)
          sendMessage('chat:message', { message: content, isSystem: true })
        },
        addErrorMessage: (err: string) => addSysMsg(`Error: ${err}`)
      }
      // Use last selected token as target if available
      const targetLabel = contextMenu?.token?.label
      executeMacro(macro, ctx, char5e, targetLabel)
    },
    [character, effectiveIsDM, playerName, lobbyPeerId, addChatMessage, sendMessage, contextMenu]
  )

  // Convert pending reaction prompts from network into local UI state
  const pendingReaction = useGameStore((s) => s.pendingReactionPrompt)
  useEffect(() => {
    if (!pendingReaction || !character) return
    if (pendingReaction.targetEntityId !== character.id) return
    if (pendingReaction.triggerType === 'shield') {
      setShieldPrompt({
        entityId: character.id,
        entityName: character.name,
        currentAC: 10, // base AC — caller should provide actual AC
        attackRoll: pendingReaction.triggerContext.attackRoll ?? 0,
        attackerName: pendingReaction.triggerContext.attackerName ?? 'Unknown'
      })
    } else if (pendingReaction.triggerType === 'counterspell') {
      setCounterspellPrompt({
        entityId: character.id,
        entityName: character.name,
        casterName: pendingReaction.triggerContext.attackerName ?? 'Unknown',
        spellName: pendingReaction.triggerContext.spellName ?? 'Unknown Spell',
        spellLevel: pendingReaction.triggerContext.spellLevel ?? 1,
        highestSlotAvailable: 9
      })
    }
    gameStore.setPendingReactionPrompt(null)
  }, [pendingReaction, character, gameStore])

  // Auto-open FallingDamageModal when pendingFallDamage is set
  const pendingFallDamage = useGameStore((s) => s.pendingFallDamage)
  useEffect(() => {
    if (pendingFallDamage && effectiveIsDM) {
      setActiveModal('falling')
    }
  }, [pendingFallDamage, effectiveIsDM])

  // Sync darkvision from character species onto the player's own token whenever the map loads.
  // hasDarkvision(speciesId) is the source of truth for which species have darkvision.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeMap.id is sufficient — avoids re-running on every token change
  useEffect(() => {
    if (!activeMap || !character || !is5eCharacter(character)) return
    const speciesId = character.buildChoices?.speciesId
    const dvFt = hasDarkvision(speciesId) ? 60 : 0
    const token = activeMap.tokens.find((t) => t.entityId === character.id)
    if (!token) return
    const needsUpdate = token.darkvision !== dvFt > 0 || (dvFt > 0 && token.darkvisionRange !== dvFt)
    if (needsUpdate) {
      gameStore.updateToken(activeMap.id, token.id, {
        darkvision: dvFt > 0,
        darkvisionRange: dvFt > 0 ? dvFt : undefined
      })
    }
  }, [activeMap?.id, character, gameStore])

  const handleViewModeToggle = (): void => {
    if (viewMode === 'player') {
      setViewMode('dm')
      return
    }
    setShowCharacterPicker(true)
  }
  const handleToggleFullscreen = (): void => {
    window.api.toggleFullscreen().then((fs) => setIsFullscreen(fs))
  }

  useGameEffects({ campaign, isDM, addChatMessage, sendMessage, aiInitRef, activeMap, setIsFullscreen })
  useGameNetwork({
    networkRole,
    campaignId: campaign.id,
    aiDmEnabled: campaign.aiDm?.enabled ?? false,
    campaignPlayers: campaign.players,
    addChatMessage,
    sendMessage,
    setTimeRequestToast,
    setNarrationText
  })

  const {
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
    handleWildShapeUseAdjust
  } = useGameHandlers({
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
  })

  const handlePortalEntry = useCallback(
    (portal: PortalEntryInfo) => {
      if (effectiveIsDM) {
        setPendingPortal(portal)
      }
    },
    [effectiveIsDM]
  )

  const { handleTokenMoveWithOA, handleConcentrationLost } = useTokenMovement({
    activeMap,
    teleportMove,
    addChatMessage,
    setOaPrompt,
    setConcCheckPrompt,
    onPortalEntry: handlePortalEntry
  })

  // Wire keyboard shortcuts to game actions
  useGameShortcuts(effectiveIsDM, {
    onEndTurn: handleEndTurn,
    onToggleInitiative: () => setSidebarCollapsed((c) => !c),
    onToggleJournal: () => setActiveModal((m) => (m === 'sharedJournal' ? null : 'sharedJournal')),
    onOpenDice: () => setActiveModal((m) => (m === 'diceRoller' ? null : 'diceRoller')),
    onCloseModal: () => setActiveModal(null),
    onShowShortcuts: () => setActiveModal((m) => (m === 'shortcutRef' ? null : 'shortcutRef')),
    onToggleMapEditor: () => setEditMapMode((v) => !v)
  })

  if (leaving)
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-950 text-gray-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Leaving game...</p>
        </div>
      </div>
    )

  const sidebarLeftPx = sidebarCollapsed ? 12 : sidebarWidth

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-gray-950 text-gray-100">
      {/* Map layer */}
      <div className="absolute inset-0">
        <MapCanvas
          key={mapKey}
          map={activeMap}
          isHost={effectiveIsDM}
          myCharacterId={character?.id ?? null}
          selectedTokenIds={gameStore.selectedTokenIds}
          activeTool={activeTool}
          fogBrushSize={fogBrushSize}
          onTokenMove={handleTokenMoveWithOA}
          onTokenSelect={(tokenIds) => gameStore.setSelectedTokenIds(tokenIds)}
          onCellClick={handleCellClick}
          onWallPlace={(x1, y1, x2, y2) => {
            if (!activeMap) return
            gameStore.addWallSegment(activeMap.id, {
              id: `wall-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
              x1,
              y1,
              x2,
              y2,
              type: wallType
            })
          }}
          onDoorToggle={(wallId) => {
            if (!activeMap) return
            const wall = activeMap.wallSegments?.find((w) => w.id === wallId)
            if (wall?.type === 'door') {
              gameStore.updateWallSegment(activeMap.id, wallId, { isOpen: !wall.isOpen })
              // Recompute vision when a door is toggled
              if (activeMap.fogOfWar.dynamicFogEnabled) {
                setTimeout(() => {
                  const updatedMap = gameStore.maps.find((m) => m.id === activeMap.id)
                  if (updatedMap) {
                    const lightSources = buildMapLightSources(gameStore.activeLightSources, updatedMap.tokens)
                    const { visibleCells } = recomputeVision(updatedMap, undefined, lightSources)
                    gameStore.setPartyVisionCells(visibleCells)
                    gameStore.addExploredCells(updatedMap.id, visibleCells)
                  }
                }, 0)
              }
            }
          }}
          activeAoE={activeAoE}
          activeEntityId={gameStore.initiative?.entries[gameStore.initiative.currentIndex]?.entityId ?? null}
          onTokenContextMenu={(x, y, token, mapId, selectedTokenIds) => setContextMenu({ x, y, token, mapId, selectedTokenIds })}
          onEmptyCellContextMenu={
            effectiveIsDM
              ? (gridX, gridY, screenX, screenY) => setEmptyCellMenu({ gridX, gridY, screenX, screenY })
              : undefined
          }
        />
        {gameStore.ambientLight === 'dim' && (
          <div className="absolute inset-0 bg-amber-900/20 pointer-events-none z-[1]" />
        )}
        {gameStore.ambientLight === 'darkness' && (
          <div className="absolute inset-0 bg-gray-950/60 pointer-events-none z-[1]" />
        )}
        {gameStore.underwaterCombat && <div className="absolute inset-0 bg-blue-900/15 pointer-events-none z-[1]" />}
        {(() => {
          const preset = gameStore.weatherOverride?.preset as WeatherType | undefined
          if (!preset || preset === 'clear') return null
          const effects = getWeatherEffects(preset)
          const mechanics: string[] = []
          if (effects.disadvantageRanged) mechanics.push('Disadv. on ranged attacks')
          if (effects.speedModifier < 1) mechanics.push(`Speed x${effects.speedModifier}`)
          if (effects.disadvantagePerception) mechanics.push('Disadv. on Perception')
          return (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[2] px-3 py-1.5 bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-lg shadow-lg pointer-events-none max-w-md text-center">
              <span className="text-xs font-semibold text-amber-300">{effects.description}</span>
              {mechanics.length > 0 && <span className="text-[10px] text-gray-400 ml-2">{mechanics.join(' · ')}</span>}
            </div>
          )
        })()}
        <DiceOverlay />
        <DiceTray />
      </div>

      {/* Left sidebar */}
      <div className="absolute top-0 left-0 bottom-0 z-10 flex">
        <div
          style={{ width: sidebarCollapsed ? 48 : sidebarWidth }}
          className="h-full shrink-0 transition-[width] duration-200"
        >
          <LeftSidebar
            campaign={campaign}
            campaignId={campaign.id}
            isDM={effectiveIsDM}
            character={character}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            onReadAloud={effectiveIsDM ? handleReadAloud : undefined}
          />
        </div>
        {!sidebarCollapsed && (
          <ResizeHandle
            direction="horizontal"
            onResize={handleSidebarResize}
            onDoubleClick={handleSidebarDoubleClick}
          />
        )}
      </div>

      {/* Hotbar */}
      <div
        className="absolute z-10 flex justify-center pointer-events-none"
        style={{
          left: sidebarLeftPx,
          right: 0,
          bottom: (bottomCollapsed ? 40 : bottomBarHeight) + 4
        }}
      >
        <div className="pointer-events-auto">
          <Hotbar characterId={character?.id ?? null} onExecuteMacro={handleExecuteMacro} />
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 right-0 z-10 flex flex-col"
        style={{ left: sidebarLeftPx, height: bottomCollapsed ? 40 : bottomBarHeight }}
      >
        {!bottomCollapsed && (
          <ResizeHandle direction="vertical" onResize={handleBottomResize} onDoubleClick={handleBottomDoubleClick} />
        )}
        {effectiveIsDM ? (
          <DMBottomBar
            onEditMap={() => setEditMapMode(true)}
            playerName={playerName}
            campaign={campaign}
            collapsed={bottomCollapsed}
            onToggleCollapse={() => setBottomCollapsed((c) => !c)}
            onOpenModal={(modal) => setActiveModal(modal as ActiveModal)}
            onDispute={(ruling) => {
              setDisputeContext({ ruling, citation: '' })
              setActiveModal('dispute')
            }}
            onLinkClick={handleLinkClick}
          />
        ) : (
          <PlayerBottomBar
            character={character}
            campaignId={campaign.id}
            onAction={() => setActiveModal('action')}
            onItem={() => setActiveModal('item')}
            onFamiliar={() => setActiveModal('familiar')}
            onWildShape={() => setActiveModal('wildShape')}
            onSteed={() => setActiveModal('steed')}
            onJump={() => setActiveModal('jump')}
            onFallingDamage={() => setActiveModal('falling')}
            onTravelPace={() => setActiveModal('travelPace')}
            onQuickCondition={() => setActiveModal('quickCondition')}
            onCheckTime={
              campaign.calendar
                ? () => {
                    sendMessage('player:time-request', { requesterId: 'local', requesterName: playerName })
                  }
                : undefined
            }
            onLightSource={() => setActiveModal('lightSource')}
            onDowntime={() => setActiveModal('downtime')}
            onSpellRef={() => setActiveModal('spellRef')}
            onShortcutRef={() => setActiveModal('shortcutRef')}
            onWhisper={() => setActiveModal('whisper')}
            onTrade={() => setActiveModal('itemTrade')}
            onJournal={() => setActiveModal('sharedJournal')}
            onCompendium={() => setActiveModal('compendium')}
            playerName={playerName}
            campaign={campaign}
            collapsed={bottomCollapsed}
            onToggleCollapse={() => setBottomCollapsed((c) => !c)}
            onOpenModal={(modal) => setActiveModal(modal as ActiveModal)}
            onLinkClick={handleLinkClick}
          />
        )}
      </div>

      {/* Floating overlays */}
      <div className="absolute top-3 right-3 z-40 flex items-center gap-2">
        {isDM && <ViewModeToggle viewMode={viewMode} onToggle={handleViewModeToggle} characterName={character?.name} />}
        {campaign.calendar && (
          <ClockOverlay
            calendar={campaign.calendar}
            isDM={effectiveIsDM}
            onEditTime={() => setActiveModal('timeEdit')}
            onShortRest={handleShortRest}
            onLongRest={handleLongRest}
            onLightSource={() => setActiveModal('lightSource')}
            onPhaseChange={(phase, suggestedLight) => {
              if (isDM) {
                setPhaseChangeToast({ phase, suggestedLight })
                if (phase === 'dawn') {
                  processDawnRecharge(campaign.id)
                }
              }
            }}
          />
        )}
        {isDM && <DmAlertTray />}
        <SettingsDropdown
          campaign={campaign}
          isDM={effectiveIsDM}
          isOpen={settingsOpen}
          onToggle={() => setSettingsOpen(!settingsOpen)}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          onLeaveGame={handleLeaveGame}
          onSaveCampaign={effectiveIsDM ? handleSaveCampaign : undefined}
          onEndSession={effectiveIsDM ? handleEndSession : undefined}
          onCreateCharacter={effectiveIsDM ? handleCreateCharacter : undefined}
        />
      </div>
      {gameStore.initiative && <InitiativeOverlay isDM={effectiveIsDM} />}
      {gameStore.initiative &&
        currentInitEntity &&
        (isMyTurn || (effectiveIsDM && currentInitEntity.entityType !== 'player')) && (
          <ActionEconomyBar
            entityId={currentInitEntity.entityId}
            entityName={currentInitEntity.entityName}
            isDM={effectiveIsDM}
            isMyTurn={isMyTurn || (effectiveIsDM && currentInitEntity.entityType !== 'player')}
            onEndTurn={handleEndTurn}
          />
        )}
      {turnBanner && (
        <TurnNotificationBanner entityName={turnBanner.entityName} onDismiss={() => setTurnBanner(null)} />
      )}
      {contextMenu && (
        <TokenContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          token={contextMenu.token}
          mapId={contextMenu.mapId}
          selectedTokenIds={contextMenu.selectedTokenIds}
          isDM={effectiveIsDM}
          characterId={character?.id}
          onClose={() => setContextMenu(null)}
          onOpenMountModal={() => setActiveModal('mount')}
          onEditToken={(token) => {
            setEditingToken({ token, mapId: contextMenu.mapId })
            setActiveModal('tokenEditor')
            setContextMenu(null)
          }}
          onAddToInitiative={(token) => {
            const roll = Math.floor(Math.random() * 20) + 1
            const modifier = token.initiativeModifier ?? 0
            gameStore.addToInitiative({
              id: token.id,
              entityId: token.entityId,
              entityName: token.label,
              entityType: token.entityType,
              roll,
              modifier,
              total: roll + modifier,
              isActive: false
            })
            setContextMenu(null)
          }}
        />
      )}
      {effectiveIsDM && <LairActionPrompt />}
      {pendingPortal && effectiveIsDM && (
        <PortalPrompt
          portal={pendingPortal}
          onConfirm={() => {
            gameStore.setActiveMap(pendingPortal.targetMapId)
            gameStore.moveToken(
              pendingPortal.targetMapId,
              pendingPortal.tokenId,
              pendingPortal.targetGridX,
              pendingPortal.targetGridY
            )
            setPendingPortal(null)
          }}
          onCancel={() => setPendingPortal(null)}
        />
      )}
      {emptyCellMenu && activeMap && (
        <EmptyCellContextMenu
          gridX={emptyCellMenu.gridX}
          gridY={emptyCellMenu.gridY}
          screenX={emptyCellMenu.screenX}
          screenY={emptyCellMenu.screenY}
          mapId={activeMap.id}
          onClose={() => setEmptyCellMenu(null)}
          onPlaceToken={() => setActiveModal('creatures')}
        />
      )}
      {!effectiveIsDM && showCompactHUD ? (
        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto">
          <PlayerHUD character={character} conditions={playerConditions} />
          {character && (
            <div className="hidden">
              <CharacterMiniSheet character={character} />
              <ConditionTracker conditions={playerConditions} isHost={false} onRemoveCondition={() => {}} />
              <SpellSlotTracker />
            </div>
          )}
        </div>
      ) : (
        !effectiveIsDM && <PlayerHUDOverlay character={character} conditions={playerConditions} />
      )}
      {gameStore.timerRunning && <TimerOverlay />}
      {narrationText && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <NarrationOverlay text={narrationText} onDismiss={() => setNarrationText(null)} />
          </Suspense>
        </ErrorBoundary>
      )}
      {!effectiveIsDM && gameStore.pendingGroupRoll && character && (
        <RollRequestOverlay
          request={gameStore.pendingGroupRoll}
          character={character}
          onRoll={(result) => {
            gameStore.addGroupRollResult({
              entityId: lobbyPeerId ?? '',
              entityName: lobbyDisplayName ?? 'Player',
              ...result
            })
            sendMessage('player:roll-result', {
              entityId: character.id,
              entityName: character.name,
              ...result
            })
            gameStore.setPendingGroupRoll(null)
          }}
          onDismiss={() => gameStore.setPendingGroupRoll(null)}
        />
      )}

      {/* DM toolbars */}
      {effectiveIsDM && (activeTool === 'fog-reveal' || activeTool === 'fog-hide') && (
        <FogToolbar
          activeTool={activeTool}
          fogBrushSize={fogBrushSize}
          onSetTool={setActiveTool}
          onSetBrushSize={setFogBrushSize}
          dynamicFogEnabled={activeMap?.fogOfWar.dynamicFogEnabled}
          onDynamicFogToggle={
            activeMap ? (enabled) => gameStore.setDynamicFogEnabled(activeMap.id, enabled) : undefined
          }
        />
      )}
      {effectiveIsDM && activeTool === 'wall' && (
        <WallToolbar wallType={wallType} onSetWallType={setWallType} onDone={() => setActiveTool('select')} />
      )}
      {/* Drawing tools button - appears when not in drawing mode */}
      {activeTool === 'select' && (
        <div className="absolute top-16 right-4 z-20 flex flex-col gap-1 bg-gray-900/90 backdrop-blur-sm border border-gray-700/50 rounded-xl p-2 shadow-xl">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider text-center mb-1">Drawing</p>
          <button
            onClick={() => setActiveTool('draw-free')}
            title="Free Draw (F)"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            ✏️
          </button>
          <button
            onClick={() => setActiveTool('draw-line')}
            title="Draw Line (L)"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            📏
          </button>
          <button
            onClick={() => setActiveTool('draw-rect')}
            title="Draw Rectangle (R)"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            ▭
          </button>
          <button
            onClick={() => setActiveTool('draw-circle')}
            title="Draw Circle (C)"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            ○
          </button>
          <button
            onClick={() => setActiveTool('draw-text')}
            title="Add Text (T)"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
          >
            📝
          </button>
        </div>
      )}

      {/* Drawing toolbar - appears when in drawing mode */}
      {(activeTool === 'draw-free' || activeTool === 'draw-line' || activeTool === 'draw-rect' || activeTool === 'draw-circle' || activeTool === 'draw-text') && (
        <DrawingToolbar
          activeTool={activeTool}
          strokeWidth={drawingStrokeWidth}
          color={drawingColor}
          onSetTool={setActiveTool}
          onSetStrokeWidth={setDrawingStrokeWidth}
          onSetColor={setDrawingColor}
          onClearDrawings={effectiveIsDM && activeMap ? () => gameStore.clearDrawings(activeMap.id) : undefined}
          isHost={effectiveIsDM}
        />
      )}

      {!effectiveIsDM && <ShopView />}

      {/* Character picker for DM player-view toggle */}
      {showCharacterPicker && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <CharacterPickerOverlay
              campaignId={campaign.id}
              onSelect={(c) => {
                // Prefer latest data from the store over potentially stale picker data
                const fresh = allCharacters.find((ch) => ch.id === c.id)
                const charToSave = fresh ?? c
                useCharacterStore
                  .getState()
                  .saveCharacter({ ...charToSave, campaignId: campaign.id, updatedAt: new Date().toISOString() })
                setShowCharacterPicker(false)
                setViewMode('player')
              }}
              onClose={() => setShowCharacterPicker(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Modals */}
      <ModalErrorBoundary modalName="Game Modal" onClose={() => setActiveModal(null)}>
        <GameModalDispatcher
          activeModal={activeModal}
          setActiveModal={setActiveModal}
          effectiveIsDM={effectiveIsDM}
          isDM={isDM}
          character={character}
          playerName={playerName}
          campaign={campaign}
          isMyTurn={isMyTurn}
          handleAction={handleAction}
          handleRestApply={handleRestApply}
          getCampaignCharacterIds={getCampaignCharacterIds}
          setActiveAoE={setActiveAoE}
          disputeContext={disputeContext}
          setDisputeContext={setDisputeContext}
          editingToken={editingToken}
          setEditingToken={setEditingToken}
          viewingHandout={viewingHandout}
          setViewingHandout={setViewingHandout}
          setConcCheckPrompt={setConcCheckPrompt}
          handleCompanionSummon={handleCompanionSummon}
          handleWildShapeTransform={handleWildShapeTransform}
          handleWildShapeRevert={handleWildShapeRevert}
          handleWildShapeUseAdjust={handleWildShapeUseAdjust}
          localPeerId={lobbyPeerId ?? ''}
        />
      </ModalErrorBoundary>

      {/* Character Inspect Modal (driven by store state, not activeModal) */}
      <InspectModalRenderer />

      {/* Toast overlays */}
      {timeRequestToast && isDM && (
        <TimeRequestToast toast={timeRequestToast} onDismiss={() => setTimeRequestToast(null)} />
      )}
      {restRequestToast && isDM && (
        <RestRequestToast
          toast={restRequestToast}
          onDismiss={() => setRestRequestToast(null)}
          onShortRest={handleShortRest}
          onLongRest={handleLongRest}
        />
      )}
      {phaseChangeToast && isDM && (
        <PhaseChangeToast toast={phaseChangeToast} onDismiss={() => setPhaseChangeToast(null)} />
      )}
      {longRestWarning && <LongRestWarning onOverride={executeLongRest} onCancel={() => setLongRestWarning(false)} />}
      {activeAoE && <AoEDismissButton onClear={() => setActiveAoE(null)} />}

      {/* Game prompts */}
      {oaPrompt && (
        <OpportunityAttackPrompt
          prompt={oaPrompt}
          onDismiss={() => setOaPrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
        />
      )}
      {concCheckPrompt && (
        <ConcentrationCheckPrompt
          prompt={concCheckPrompt}
          onDismiss={() => setConcCheckPrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
          onConcentrationLost={handleConcentrationLost}
        />
      )}
      {stabilizePrompt && (
        <StabilizeCheckPrompt
          prompt={stabilizePrompt}
          character={character}
          onDismiss={() => setStabilizePrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
        />
      )}
      {shieldPrompt && (
        <ShieldReactionPrompt
          prompt={shieldPrompt}
          onDismiss={() => setShieldPrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
        />
      )}
      {counterspellPrompt && (
        <CounterspellReactionPrompt
          prompt={counterspellPrompt}
          onDismiss={() => setCounterspellPrompt(null)}
          addChatMessage={addChatMessage}
          sendMessage={sendMessage}
        />
      )}

      {/* DM Map Editor fullscreen */}
      {editMapMode && effectiveIsDM && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <DMMapEditor
              campaign={campaign}
              onClose={() => {
                setEditMapMode(false)
                setMapKey((k) => k + 1)
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {effectiveIsDM && aiDmStore.pendingActions && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <RulingApprovalModal />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  )
}
