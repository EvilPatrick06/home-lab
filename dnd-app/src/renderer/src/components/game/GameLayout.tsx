import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useDiscordSync } from '../../hooks/use-discord-sync'
import { useDmTriggers } from '../../hooks/use-dm-triggers'
import { useGameEffects } from '../../hooks/use-game-effects'
import { useGameHandlers } from '../../hooks/use-game-handlers'
import { useGameNetwork } from '../../hooks/use-game-network'
import { useGameShortcuts } from '../../hooks/use-game-shortcuts'
import { useMonsterAutoTurn } from '../../hooks/use-monster-auto-turn'
import { useSceneAutoExit } from '../../hooks/use-scene-auto-exit'
import { addToast } from '../../hooks/use-toast'
import type { PortalEntryInfo } from '../../hooks/use-token-movement'
import { useTokenMovement } from '../../hooks/use-token-movement'
import { useT } from '../../i18n'
import { onClientMessage } from '../../network'
import { useChatBridge } from '../../pages/lobby/use-lobby-bridges'
import { exitSceneMode } from '../../services/game/scene-mode-controller'
import { buildTokenStubFromCharacter } from '../../services/game-actions/character-token'
import { type PlaceableToken, smartPlaceTokens } from '../../services/game-actions/token-placement'
import { buildContentIndex } from '../../services/library/content-index'
import { loadCategoryItems } from '../../services/library-service'
import { executeMacro } from '../../services/macro-engine'
import { buildMapLightSources, hasDarkvision, recomputeVision } from '../../services/map/vision-computation'
import type { WeatherType } from '../../services/weather-mechanics'
import { useNetworkStore } from '../../stores/network-store'
import { useAiDmStore } from '../../stores/use-ai-dm-store'
import { useCharacterStore } from '../../stores/use-character-store'
import { useGameStore } from '../../stores/use-game-store'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useMacroStore } from '../../stores/use-macro-store'
import type { Campaign } from '../../types/campaign'
import type { Character } from '../../types/character'
import { is5eCharacter } from '../../types/character'
import type { MapToken } from '../../types/map'
import { getBuilderCreatePath } from '../../utils/character-routes'
import { cryptoRollDie } from '../../utils/crypto-random'
import { processDawnRecharge } from '../../utils/dawn-recharge'
import { ErrorBoundary, ModalErrorBoundary } from '../ui'
import { announce } from '../ui/ScreenReaderAnnouncer'
import DMBottomBar from './bottom/DMBottomBar'
import PlayerBottomBar from './bottom/PlayerBottomBar'
// DiceOverlay imported in App.tsx only — see P-2 comment below.
import DiceTray from './dice3d/DiceTray'
import GameCommandPalette from './GameCommandPalette'
import type { ActiveModal } from './GameModalDispatcher'
import GameModalDispatcher from './GameModalDispatcher'
import {
  DrawingToolPicker,
  GamePromptsLayer,
  InspectModalRenderer,
  MapSelector,
  useFullscreen,
  usePanelResize,
  useViewMode,
  ViewAsSelector,
  WeatherBanner
} from './game-layout'
import type { AoEConfig } from './map/aoe-overlay'
import MapCanvas from './map/MapCanvas'
import { RESET_MAP_VIEW_EVENT } from './map/map-canvas/map-canvas-hooks'
import ActionEconomyBar from './overlays/ActionEconomyBar'
import ClockOverlay from './overlays/ClockOverlay'
import DmAlertTray from './overlays/DmAlertTray'
import EmptyCellContextMenu from './overlays/EmptyCellContextMenu'
import FloatingDMPanel from './overlays/FloatingDMPanel'
import type { ConcCheckPromptState, OaPromptState, StabilizePromptState } from './overlays/GamePrompts'
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
import MutationApprovalPanel from './overlays/MutationApprovalPanel'
import PlayerHUDOverlay from './overlays/PlayerHUDOverlay'
import PortalPrompt from './overlays/PortalPrompt'
import type { CounterspellPromptState, ShieldPromptState } from './overlays/ReactionPrompts'
import RollRequestOverlay from './overlays/RollRequestOverlay'
import SettingsDropdown from './overlays/SettingsDropdown'
import SceneModeOverlay from './overlays/scene/SceneModeOverlay'
import TimerOverlay from './overlays/TimerOverlay'
import TokenContextMenu from './overlays/TokenContextMenu'
import TurnNotificationBanner from './overlays/TurnNotificationBanner'
import ViewModeToggle from './overlays/ViewModeToggle'
import WebSearchApprovalPrompt from './overlays/WebSearchApprovalPrompt'
import { CharacterMiniSheet, ConditionTracker, PlayerHUD, ShopView, SpellSlotTracker } from './player'
import PlayerNotesPanel from './player/PlayerNotesPanel'
import SpellPrepModal from './player/SpellPrepModal'
import ResizeHandle from './ResizeHandle'
import LeftSidebar from './sidebar/LeftSidebar'

const PinCreateModal = lazy(() => import('./modals/dm-tools/PinCreateModal'))
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

export default function GameLayout({ campaign, isDM, character, playerName }: GameLayoutProps): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editMapMode, setEditMapMode] = useState(false)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  // PHASE-13 13H — deep-link targets for the compendium (chat links) + shared journal (pins).
  const [compendiumTarget, setCompendiumTarget] = useState<{ category: string; name: string } | null>(null)
  const [journalFocusEntryId, setJournalFocusEntryId] = useState<string | null>(null)
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    bottomCollapsed,
    setBottomCollapsed,
    bottomBarHeight,
    sidebarWidth,
    handleBottomResize,
    handleBottomDoubleClick,
    handleSidebarResize,
    handleSidebarDoubleClick
  } = usePanelResize()
  const [mapKey, setMapKey] = useState(0)
  const { isFullscreen, setIsFullscreen, handleToggleFullscreen } = useFullscreen()
  const [leaving, setLeaving] = useState(false)
  const [teleportMove, _setTeleportMove] = useState(false)
  const [activeAoE, setActiveAoE] = useState<AoEConfig | null>(null)
  // Phase 29f — view-as-role state (extracted to ./game-layout/use-view-mode).
  // `viewMode` stays the string the rest of the layout reads ('dm' = full DM
  // view, 'player' = filtered). `viewAs` carries the optional target role/player
  // the DM is previewing (drives the banner + label).
  const { viewMode, viewAs, setViewMode, setViewAsTarget } = useViewMode(campaign.id)
  const [showCharacterPicker, setShowCharacterPicker] = useState(false)
  const [activeTool, setActiveTool] = useState<
    | 'select'
    | 'fog-reveal'
    | 'fog-hide'
    | 'wall'
    | 'measure'
    | 'check-los'
    | 'draw-free'
    | 'draw-line'
    | 'draw-rect'
    | 'draw-circle'
    | 'draw-text'
  >('select')
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
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    token: MapToken
    mapId: string
    selectedTokenIds: string[]
  } | null>(null)
  const [emptyCellMenu, setEmptyCellMenu] = useState<{
    gridX: number
    gridY: number
    screenX: number
    screenY: number
  } | null>(null)
  const [editingToken, setEditingToken] = useState<{ token: MapToken; mapId: string } | null>(null)
  const [viewingHandout, setViewingHandout] = useState<import('../../types/game-state').Handout | null>(null)
  // Phase 16b Step 4 — cell awaiting a rich pin-create form (null = closed).
  const [pinDraftCell, setPinDraftCell] = useState<{ gridX: number; gridY: number } | null>(null)
  const [narrationText, setNarrationText] = useState<string | null>(null)
  const [oaPrompt, setOaPrompt] = useState<OaPromptState | null>(null)
  const [stabilizePrompt, setStabilizePrompt] = useState<StabilizePromptState | null>(null)
  const [concCheckPrompt, setConcCheckPrompt] = useState<ConcCheckPromptState | null>(null)
  const [turnBanner, setTurnBanner] = useState<{ entityName: string } | null>(null)
  const [shieldPrompt, setShieldPrompt] = useState<ShieldPromptState | null>(null)
  const [counterspellPrompt, setCounterspellPrompt] = useState<CounterspellPromptState | null>(null)
  const [showCompactHUD, _setShowCompactHUD] = useState(false)
  const [_groupConditionEntities, _setGroupConditionEntities] = useState<string[] | null>(null)
  const [conditionTargetEntityId, setConditionTargetEntityId] = useState<string | null>(null)
  const [pendingPortal, setPendingPortal] = useState<PortalEntryInfo | null>(null)
  const prevEntityIdRef = useRef<string | null>(null)

  // Clear condition target when quickCondition modal closes
  useEffect(() => {
    if (activeModal !== 'quickCondition') {
      setConditionTargetEntityId(null)
    }
  }, [activeModal])

  // PHASE-13 13H — clear deep-link targets once their modal closes.
  useEffect(() => {
    if (activeModal !== 'compendium') setCompendiumTarget(null)
    if (activeModal !== 'sharedJournal') setJournalFocusEntryId(null)
  }, [activeModal])

  // Build content index for [[name]] linking in chat
  useEffect(() => {
    const categories = ['monsters', 'spells', 'magic-items', 'weapons', 'armor', 'gear', 'conditions'] as const
    Promise.allSettled(categories.map((c) => loadCategoryItems(c, []))).then((results) => {
      const allItems = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      buildContentIndex(allItems)
    })
  }, [])

  const gameStore = useGameStore()
  const networkRole = useNetworkStore((s) => s.role)
  const sendMessage = useNetworkStore((s) => s.sendMessage)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)
  const lobbyPeerId = useNetworkStore((s) => s.localPeerId)
  // Mount the chat bridge so incoming chat:message / chat:file broadcasts
  // get written into the lobby store while the player is in /game/.
  // LobbyPage's `useLobbyBridges` tears down on unmount when the player
  // navigates lobby → game; without this in-game subscription the host
  // still broadcasts everyone's chat, the sender still sees their own
  // local echo (sendChat adds via addChatMessage directly), but no other
  // peer's incoming messages reach the store. Result: in-game chat
  // appeared one-way to senders only.
  useChatBridge(networkRole === 'host' ? 'host' : networkRole === 'client' ? 'client' : 'none', lobbyPeerId)
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

  const handleLinkClick = useCallback((category: string, name: string) => {
    // PHASE-13 13H — open the compendium pre-navigated to the clicked entry: its tab
    // (when the category has one) with the name auto-selected / search-seeded.
    setCompendiumTarget({ category, name })
    setActiveModal('compendium')
  }, [])

  const effectiveIsDM = isDM && viewMode === 'dm'
  // PHASE-35 — exit the cinematic scene (controller owns broadcast + ambient restore).
  const handleExitScene = useCallback(() => exitSceneMode(), [])
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

  // Client follow: when the host sends everyone back to the ready-up lobby
  // (Return to Lobby), navigate there too — WITHOUT disconnecting. The
  // returnedToLobby flag stops LobbyPage's in-progress auto-nav from bouncing
  // the client straight back into /game.
  useEffect(() => {
    if (networkRole !== 'client') return
    return onClientMessage((msg: { type: string; payload: unknown }) => {
      if (msg.type === 'dm:return-to-lobby') {
        useLobbyStore.getState().setReturnedToLobby(true)
        navigate(`/lobby/${campaign.id}`)
      }
    })
  }, [networkRole, campaign.id, navigate])

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

  // Auto-place a map token for each party PC that doesn't have one yet, on game load.
  // The engine had a token factory (buildTokenStubFromCharacter) but nothing ever called
  // it, so PCs entered the game with no token on the map. Only the authoritative side
  // (host, or solo where there's no network) writes to the map — clients receive tokens
  // via host sync, so a 'client' must NOT place (that would desync / duplicate). The
  // local player in a solo AI game is a player (not the DM — the AI is), so this is
  // deliberately NOT gated on isDM. The token-existence check keeps re-runs idempotent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on map id; the existence check makes re-runs idempotent
  useEffect(() => {
    if (!activeMap || networkRole === 'client') return
    // Party character ids: connected lobby players, else the solo campaign's active players.
    const lobbyIds = useLobbyStore
      .getState()
      .players.filter((p) => p.characterId)
      .map((p) => p.characterId as string)
    const ids =
      lobbyIds.length > 0
        ? lobbyIds
        : campaign.players.filter((p) => p.isActive && p.characterId).map((p) => p.characterId as string)
    if (character) ids.push(character.id) // always cover the local PC (solo lists may lag)

    const seen = new Set<string>()
    const toPlace: PlaceableToken[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      if (activeMap.tokens.some((tok) => tok.entityId === id)) continue // already on the map
      const char = id === character?.id ? character : (allCharacters.find((c) => c.id === id) ?? null)
      if (!char || !is5eCharacter(char)) continue // can't resolve the sheet → skip (e.g. remote PC not synced)
      toPlace.push({ ...buildTokenStubFromCharacter(char), id: crypto.randomUUID() })
    }
    if (toPlace.length === 0) return
    for (const tok of smartPlaceTokens(activeMap, toPlace)) {
      gameStore.addToken(activeMap.id, tok as MapToken)
    }
  }, [activeMap?.id, character, networkRole, allCharacters, campaign.players, gameStore])

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

  // Phase 14c: F5 toggles DM ↔ Player view (DM-only). Designed so a
  // DM can peek at the player perspective and flip back fast without
  // hunting for the ViewModeToggle button.
  useEffect(() => {
    if (!isDM) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F5') return
      const target = e.target as HTMLElement | null
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return
      if (target?.isContentEditable) return
      e.preventDefault()
      setViewMode(viewMode === 'dm' ? 'player' : 'dm')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDM, viewMode, setViewMode])

  // QA-S8: surface a toast when the campaign calendar preset changes
  // mid-session. The change can happen behind the DM's back (a co-DM,
  // a campaign-settings edit, or another open window). Without a
  // notification the DM doesn't notice their dates suddenly read in a
  // different format.
  const prevCalendarPresetRef = useRef<string | null>(campaign.calendar?.preset ?? null)
  useEffect(() => {
    const next = campaign.calendar?.preset ?? null
    const prev = prevCalendarPresetRef.current
    if (prev !== null && next !== null && prev !== next) {
      addToast(t('game.gameLayout.calendarChanged', { preset: next.replace(/-/g, ' ') }), 'info')
    }
    prevCalendarPresetRef.current = next
  }, [campaign.calendar?.preset, t])

  // PHASE-28 28C: surface quest-checker auto-ticks + chapter proposals as DM-side system chat
  // notes (the auto-tick undo / chapter-advance surface is the quest panel in the AI DM tab).
  useEffect(() => {
    if (!isDM) return
    const off = window.api.ai.onQuestStateChanged?.((data) => {
      if (data.campaignId !== campaign.id) return
      const sys = (content: string): void =>
        addChatMessage({
          id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'system',
          senderName: 'System',
          content,
          timestamp: Date.now(),
          isSystem: true
        })
      for (const u of data.applied) {
        sys(
          t('game.gameLayout.questObjectiveAutoDetected', {
            verb: u.result,
            quest: u.quest,
            objective: u.objective
          })
        )
      }
      if (data.pendingChapterAdvance) sys(t('game.gameLayout.chapterAdvanceProposed'))
    })
    return () => off?.()
  }, [isDM, campaign.id, addChatMessage, t])

  const handleViewModeToggle = (): void => {
    if (viewMode === 'player') {
      setViewMode('dm')
      return
    }
    setShowCharacterPicker(true)
  }

  // PHASE-27 27C: AI memory sync is now a single writer driven by use-game-effects.ts
  // (startAiMemorySync, gated on isDM && aiDm.enabled). The duplicate useAiMemorySync hook
  // (host-gated, divergent payload) was deleted to end the two-writer last-write-wins race.

  // PHASE-22 22E: Discord sync — DM-side activity feed + opt-in state push.
  useDiscordSync({ isDM, campaignId: campaign.id })

  // DM trigger system — push state to the observer + run fired triggers (DM only).
  useDmTriggers(effectiveIsDM)

  useGameEffects({ campaign, isDM, addChatMessage, sendMessage, aiInitRef, activeMap, setIsFullscreen })
  useMonsterAutoTurn() // PHASE-30 30E — opt-in enemy auto-run (no-op unless monsterAutomation.autoRun)
  useSceneAutoExit(networkRole !== 'client') // PHASE-35 35F — host/solo exits the scene when combat starts
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
    handleReturnToLobby,
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
    onCloseModal: () => {
      // Esc should also leave the full-screen map editor (back to play),
      // not just close transient modals.
      if (editMapMode) {
        setEditMapMode(false)
        setMapKey((k) => k + 1)
        return
      }
      setActiveModal(null)
    },
    onShowShortcuts: () => setActiveModal((m) => (m === 'shortcutRef' ? null : 'shortcutRef')),
    onToggleMapEditor: () => setEditMapMode((v) => !v),
    // Phase 15g — player-side shortcuts. Modal toggles so pressing the
    // same key twice closes the panel. Measure toggle flips back to
    // 'select' if already active so 'r' acts as a true toggle.
    onOpenPlayerNotes: () => setActiveModal((m) => (m === 'playerNotes' ? null : 'playerNotes')),
    onOpenInventory: () => setActiveModal((m) => (m === 'item' ? null : 'item')),
    onToggleMeasure: () => setActiveTool((t) => (t === 'measure' ? 'select' : 'measure')),
    // Phase 16A — center the camera on the local player's character.
    onCenterOnMe: () => {
      if (character?.id) {
        useGameStore.getState().requestCenterOnEntity(character.id)
      }
    }
  })

  if (leaving)
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-base text-fg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted">Leaving game...</p>
        </div>
      </div>
    )

  const sidebarLeftPx = sidebarCollapsed ? 12 : sidebarWidth

  return (
    <div
      className="h-screen w-screen relative overflow-hidden bg-base text-fg"
      role="application"
      aria-label={t('game.gameLayout.gameSession')}
    >
      {/* Phase 29f — view-as-role banner so the DM knows why their tools vanished. */}
      {viewAs && (
        <button
          type="button"
          onClick={() => setViewAsTarget(null)}
          className="absolute top-0 start-1/2 -translate-x-1/2 z-50 mt-2 px-3 py-1 rounded-full bg-amber-600/90 text-white text-xs font-semibold shadow-lg cursor-pointer hover:bg-accent-strong"
        >
          Viewing as {viewAs.label} — click to exit
        </button>
      )}

      {/* Map layer */}
      <div className="absolute inset-0" role="region" aria-label={t('game.gameLayout.gameMap')}>
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
          onTokenContextMenu={(x, y, token, mapId, selectedTokenIds) =>
            setContextMenu({ x, y, token, mapId, selectedTokenIds })
          }
          onEmptyCellContextMenu={
            effectiveIsDM
              ? (gridX, gridY, screenX, screenY) => setEmptyCellMenu({ gridX, gridY, screenX, screenY })
              : undefined
          }
          // Phase 16b Step 3 / PHASE-13 13H — click a pin: open its linked journal scrolled to
          // the entry if set, otherwise surface the label.
          onPinClick={(pin) => {
            if (pin.linkedJournalId) {
              setJournalFocusEntryId(pin.linkedJournalId)
              setActiveModal('sharedJournal')
            } else {
              addToast(pin.label, 'info')
            }
          }}
          // Phase 17v — drawing color + stroke width were declared in this
          // component (lines ~178-179) and bound to the DrawingToolbar, but
          // never plumbed through to MapCanvas. That meant the canvas always
          // saw `undefined` and the event-handler default `'#ffffff'` /
          // stroke 3 fell back in — "stuck on white, no matter what color
          // is chosen" + the thickness slider had no visible effect.
          drawingColor={drawingColor}
          drawingStrokeWidth={drawingStrokeWidth}
        />
        {gameStore.ambientLight === 'dim' && (
          <div className="absolute inset-0 bg-amber-900/20 pointer-events-none z-[1]" />
        )}
        {gameStore.ambientLight === 'darkness' && (
          <div className="absolute inset-0 bg-base/60 pointer-events-none z-[1]" />
        )}
        {gameStore.underwaterCombat && <div className="absolute inset-0 bg-blue-900/15 pointer-events-none z-[1]" />}
        <SceneModeOverlay isDM={effectiveIsDM} onExit={handleExitScene} />
        <WeatherBanner preset={gameStore.weatherOverride?.preset as WeatherType | undefined} />
        {/* P-2 (v2.1.31 QA): DiceOverlay is already mounted globally in
            App.tsx — mounting it again here registered a second listener
            against the trigger3dDice event bus, which made every chat
            roll produce two DiceTray entries (matching `(2)` badge per
            roll). Tray itself stays here so per-game position state
            survives map/scene swaps. */}
        <DiceTray />
      </div>

      {/* Left sidebar */}
      <div
        className="absolute top-0 start-0 bottom-0 z-10 flex"
        role="region"
        aria-label={t('game.gameLayout.gameSidebar')}
      >
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
        className="absolute bottom-0 end-0 z-10 flex flex-col"
        style={{ left: sidebarLeftPx, height: bottomCollapsed ? 40 : bottomBarHeight }}
        role="region"
        aria-label={t('game.gameLayout.gameControls')}
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
            onMeasure={() => setActiveTool('measure')}
            onCheckLos={() => setActiveTool('check-los')}
            onMyNotes={() => setActiveModal('playerNotes')}
            onSpellPrep={() => setActiveModal('spellPrep')}
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
      <div
        className="absolute top-3 end-3 z-40 flex items-center gap-1.5 flex-wrap justify-end max-w-[calc(100vw-2rem)]"
        role="region"
        aria-label={t('game.gameLayout.gameControlsToolbar')}
      >
        {/* Reset View — inline in this cluster (was a separate absolute button in
            MapCanvas that sat behind the cluster + the settings gear). Fires the
            event MapCanvas's reset hook listens for. */}
        {gameStore.activeMapId && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(RESET_MAP_VIEW_EVENT))}
            title={t('game.mapCanvas.resetViewTitle')}
            aria-label={t('game.mapCanvas.resetViewLabel')}
            className="px-3 py-1.5 text-xs font-medium bg-surface-2/90 border border-border rounded-lg text-muted hover:text-gray-200 hover:bg-gray-700 transition-colors cursor-pointer backdrop-blur-sm"
          >
            {t('game.mapCanvas.resetView')}
          </button>
        )}
        {isDM && <ViewModeToggle viewMode={viewMode} onToggle={handleViewModeToggle} characterName={character?.name} />}
        {/* Phase 29f — View-as-role debug selector (DM only). */}
        {isDM && <ViewAsSelector campaign={campaign} viewAs={viewAs} setViewAsTarget={setViewAsTarget} />}
        {effectiveIsDM && gameStore.maps.length > 1 && (
          <MapSelector
            maps={gameStore.maps}
            activeMapId={gameStore.activeMapId}
            onSelect={(nextMapId) => {
              gameStore.setActiveMap(nextMapId)
              // Phase 17x — fire the dm:map-change broadcast directly here
              // as belt-and-suspenders alongside the game-sync subscriber
              // (which also detects activeMapId changes). The
              // subscriber-based path has been observed to miss broadcasts
              // when the host has fast successive changes; the explicit
              // sendMessage guarantees the client receives the switch.
              const sendMessage = useNetworkStore.getState().sendMessage
              const nextMap = gameStore.maps.find((m) => m.id === nextMapId)
              if (nextMap) {
                sendMessage('dm:map-change', { mapId: nextMapId, mapData: { ...nextMap } })
              } else {
                sendMessage('dm:map-change', { mapId: nextMapId })
              }
            }}
          />
        )}
        {/* PHASE-35 — DM quick toggle: open the scene composer, or jump straight back to the grid. */}
        {effectiveIsDM && (
          <button
            type="button"
            onClick={() => (gameStore.sceneMode ? handleExitScene() : setActiveModal('sceneMode'))}
            className={`px-2 py-1 rounded text-xs font-semibold border cursor-pointer ${gameStore.sceneMode ? 'bg-amber-600 border-amber-500 text-white' : 'bg-surface-2 border-border text-gray-300 hover:bg-surface-3'}`}
          >
            {gameStore.sceneMode ? t('game.sceneMode.backToGrid') : t('game.sceneMode.openScene')}
          </button>
        )}
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
        {isDM && <MutationApprovalPanel />}
        {isDM && <WebSearchApprovalPrompt />}
        <SettingsDropdown
          campaign={campaign}
          isDM={effectiveIsDM}
          isOpen={settingsOpen}
          onToggle={() => setSettingsOpen(!settingsOpen)}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          onLeaveGame={handleLeaveGame}
          onReturnToLobby={handleReturnToLobby}
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
            const roll = cryptoRollDie(20)
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
          onApplyCondition={(tokenId: string) => {
            const targetToken = activeMap?.tokens.find((t) => t.id === tokenId)
            if (targetToken) {
              setConditionTargetEntityId(targetToken.entityId)
              setActiveModal('quickCondition')
            }
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
          onPlaceToken={(gridX, gridY) => {
            // BUG-6 — remember the end-clicked cell so the creature browser places
            // the picked creature there (it used to drop at the map origin 0,0).
            gameStore.setPendingPlaceCell({ gridX, gridY })
            setActiveModal('creatures')
          }}
          // Phase 16b Step 4 — DM-only Add Pin opens the rich pin-create form (icon/color/
          // visibility/link), replacing the old label-only window.prompt.
          onAddPin={effectiveIsDM ? (gridX, gridY) => setPinDraftCell({ gridX, gridY }) : undefined}
          // S-7 — DM-only "Place AoE here": stash the cell as the AoE origin + open
          // the AoE template modal (it reads pendingPlaceCell for its origin).
          onPlaceAoE={
            effectiveIsDM
              ? (gridX, gridY) => {
                  gameStore.setPendingPlaceCell({ gridX, gridY })
                  setActiveModal('aoe')
                }
              : undefined
          }
        />
      )}
      {pinDraftCell && activeMap && effectiveIsDM && (
        <Suspense fallback={null}>
          <PinCreateModal
            gridX={pinDraftCell.gridX}
            gridY={pinDraftCell.gridY}
            onClose={() => setPinDraftCell(null)}
            onCreate={(pin) =>
              useGameStore.getState().updateMap(activeMap.id, { pins: [...(activeMap.pins ?? []), pin] })
            }
          />
        </Suspense>
      )}
      {!effectiveIsDM && showCompactHUD ? (
        <div className="absolute bottom-0 start-0 end-0 z-20 pointer-events-auto">
          <PlayerHUD character={character} conditions={playerConditions} />
          {character && (
            <div className="hidden">
              <CharacterMiniSheet character={character} />
              <ConditionTracker conditions={playerConditions} isHost={false} onRemoveCondition={() => {}} />
              <SpellSlotTracker characterId={character.id} />
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
      {/* Drawing tools button - appears when not in drawing mode.
          Phase 14b (D2): DM-only. Even though setActiveTool('draw-*')
          callers are already DM-gated, the toolbar itself was rendered
          unconditionally; if `activeTool` ever leaked into a player
          session (state-restore edge case, view-mode swap) the player
          would see drawing controls. Explicit gate closes that hole. */}
      {effectiveIsDM && activeTool === 'select' && <DrawingToolPicker onSetTool={setActiveTool} />}

      {/* Drawing toolbar - appears when in drawing mode. DM-only (14b). */}
      {effectiveIsDM &&
        (activeTool === 'draw-free' ||
          activeTool === 'draw-line' ||
          activeTool === 'draw-rect' ||
          activeTool === 'draw-circle' ||
          activeTool === 'draw-text') && (
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

      {/* Phase 15d: personal player journal — rendered inline outside the
          GameModalDispatcher because its props/IPC surface differs from
          the centralized dispatcher (storage is localStorage, no broadcast,
          no character store mutation). */}
      {activeModal === 'playerNotes' && (
        <PlayerNotesPanel characterId={character?.id ?? null} onClose={() => setActiveModal(null)} />
      )}

      {/* Phase 15f: in-game spell prep panel — only opens when there's a
          character; the modal itself checks whether they're a prepared
          caster and otherwise shows an explanatory message. */}
      {activeModal === 'spellPrep' && character && (
        <SpellPrepModal character={character} onClose={() => setActiveModal(null)} />
      )}

      {/* Modals */}
      <ModalErrorBoundary modalName="Game Modal" onClose={() => setActiveModal(null)}>
        <GameCommandPalette onOpenModal={setActiveModal} isDM={effectiveIsDM} />
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
          conditionTargetEntityId={conditionTargetEntityId}
          handleCompanionSummon={handleCompanionSummon}
          handleWildShapeTransform={handleWildShapeTransform}
          handleWildShapeRevert={handleWildShapeRevert}
          handleWildShapeUseAdjust={handleWildShapeUseAdjust}
          localPeerId={lobbyPeerId ?? ''}
          compendiumTarget={compendiumTarget}
          journalFocusEntryId={journalFocusEntryId}
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

      {/* Phase 14c (D3): when the DM is previewing the Player view,
          keep a few critical actions reachable without forcing a
          round-trip back to DM view. F5 also toggles the view. */}
      {isDM && viewMode === 'player' && (
        <FloatingDMPanel
          onSwitchToDM={() => setViewMode('dm')}
          onOpenInitiative={() => setActiveModal('initiative')}
          onNextTurn={() => gameStore.nextTurn()}
          aiDmEnabled={campaign.aiDm?.enabled ?? false}
          aiPaused={aiDmStore.paused}
          onTogglePauseAI={() => aiDmStore.setPaused(!aiDmStore.paused)}
        />
      )}

      {/* Game prompts */}
      <GamePromptsLayer
        oaPrompt={oaPrompt}
        setOaPrompt={setOaPrompt}
        concCheckPrompt={concCheckPrompt}
        setConcCheckPrompt={setConcCheckPrompt}
        stabilizePrompt={stabilizePrompt}
        setStabilizePrompt={setStabilizePrompt}
        shieldPrompt={shieldPrompt}
        setShieldPrompt={setShieldPrompt}
        counterspellPrompt={counterspellPrompt}
        setCounterspellPrompt={setCounterspellPrompt}
        character={character}
        handleConcentrationLost={handleConcentrationLost}
        addChatMessage={addChatMessage}
        sendMessage={sendMessage}
      />

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
      {isDM && aiDmStore.pendingActionSets.length > 0 && (
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <RulingApprovalModal />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  )
}
