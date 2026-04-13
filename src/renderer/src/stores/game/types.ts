import type { ShopItem, TradeRequestPayload } from '../../network'
import type { ActiveLightSource, CombatTimerConfig } from '../../types/campaign'
import type { ActiveCurse, ActiveDisease, ActiveEnvironmentalEffect, PlacedTrap } from '../../types/dm-toolbox'
import type { CustomEffect } from '../../types/effects'
import type {
  CombatLogEntry,
  DiceRollRecord,
  DmTrigger,
  EntityCondition,
  GameState,
  GroupRollRequest,
  GroupRollResult,
  Handout,
  HiddenDiceResult,
  InGameTimeState,
  InitiativeEntry,
  PartyInventory,
  PartyInventoryItem,
  SharedJournalEntry,
  SidebarCategory,
  SidebarEntry,
  TurnState
} from '../../types/game-state'
import type { GameMap, MapToken, OcclusionTile, SceneRegion, WallSegment } from '../../types/map'

// --- Session log entry ---

export interface SessionLogEntry {
  id: string
  sessionId: string
  sessionLabel: string
  realTimestamp: number
  inGameTimestamp?: string
  content: string
  editedAt?: number
}

// --- Initial state ---

export const initialState: GameState = {
  campaignId: '',
  system: 'dnd5e',
  activeMapId: null,
  maps: [],
  turnMode: 'free',
  initiative: null,
  round: 0,
  conditions: [],
  isPaused: false,
  turnStates: {},
  underwaterCombat: false,
  flankingEnabled: false,
  groupInitiativeEnabled: false,
  diagonalRule: 'standard',
  ambientLight: 'bright',
  travelPace: null,
  marchingOrder: [],
  hpBarsVisibility: 'all',
  selectedTokenIds: []
}

// --- Helper ---

export function createTurnState(entityId: string, speed: number): TurnState {
  return {
    entityId,
    movementRemaining: speed,
    movementMax: speed,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    freeInteractionUsed: false,
    isDashing: false,
    isDisengaging: false,
    isDodging: false,
    isHidden: false
  }
}

// --- Slice state interfaces ---

export interface ShopSliceState {
  shopOpen: boolean
  shopName: string
  shopInventory: ShopItem[]
  shopMarkup: number
  openShop: (name?: string) => void
  closeShop: () => void
  setShopInventory: (items: ShopItem[]) => void
  addShopItem: (item: ShopItem) => void
  removeShopItem: (itemId: string) => void
  setShopMarkup: (markup: number) => void
  updateShopItem: (itemId: string, updates: Partial<ShopItem>) => void
  purchaseItem: (itemId: string) => void
}

export interface MapTokenSliceState {
  setActiveMap: (mapId: string) => void
  addMap: (map: GameMap) => void
  deleteMap: (mapId: string) => void
  updateMap: (mapId: string, updates: Partial<GameMap>) => void
  duplicateMap: (mapId: string) => GameMap | null
  addToken: (mapId: string, token: MapToken) => void
  moveToken: (mapId: string, tokenId: string, gridX: number, gridY: number) => void
  removeToken: (mapId: string, tokenId: string) => void
  updateToken: (mapId: string, tokenId: string, updates: Partial<MapToken>) => void
  revealAllTokens: () => void
  setSelectedTokenIds: (tokenIds: string[]) => void
  addToSelection: (tokenId: string) => void
  removeFromSelection: (tokenId: string) => void
  clearSelection: () => void
  addWallSegment: (mapId: string, wall: WallSegment) => void
  removeWallSegment: (mapId: string, wallId: string) => void
  updateWallSegment: (mapId: string, wallId: string, updates: Partial<WallSegment>) => void
  toggleEmitterPlaying: (mapId: string, emitterId: string) => void
  teleportToken: (tokenId: string, sourceMapId: string, targetMapId: string, targetGridX: number, targetGridY: number) => void
  centerOnEntityId: string | null
  requestCenterOnEntity: (entityId: string) => void
  clearCenterRequest: () => void
  pendingFallDamage: { tokenId: string; mapId: string; height: number } | null
  setPendingFallDamage: (pending: { tokenId: string; mapId: string; height: number } | null) => void
  pendingPlacement: { tokenData: Omit<MapToken, 'id' | 'gridX' | 'gridY'> } | null
  setPendingPlacement: (tokenData: Omit<MapToken, 'id' | 'gridX' | 'gridY'> | null) => void
  commitPlacement: (mapId: string, gridX: number, gridY: number) => void
}

export interface PendingLairAction {
  creatureName: string
  lairActions: Array<{ name: string; description: string }>
}

export interface InitiativeSliceState {
  pendingLairAction: PendingLairAction | null
  setPendingLairAction: (action: PendingLairAction | null) => void
  startInitiative: (entries: InitiativeEntry[]) => void
  addToInitiative: (entry: InitiativeEntry) => void
  nextTurn: () => void
  prevTurn: () => void
  endInitiative: () => void
  updateInitiativeEntry: (entryId: string, updates: Partial<InitiativeEntry>) => void
  removeFromInitiative: (entryId: string) => void
  reorderInitiative: (fromIndex: number, toIndex: number) => void
  delayTurn: (entityId: string) => void
  undelay: (entityId: string) => void
  readyAction: (entityId: string, trigger: string, action: string) => void
  triggerReadyAction: (entityId: string) => void
  clearReady: (entityId: string) => void
  initTurnState: (entityId: string, speed: number) => void
  useAction: (entityId: string) => void
  useBonusAction: (entityId: string) => void
  useReaction: (entityId: string) => void
  useFreeInteraction: (entityId: string) => void
  useMovement: (entityId: string, feet: number) => void
  setDashing: (entityId: string) => void
  setDisengaging: (entityId: string) => void
  setDodging: (entityId: string) => void
  setHidden: (entityId: string, hidden: boolean) => void
  setConcentrating: (entityId: string, spell: string | undefined) => void
  resetTurnState: (entityId: string, speed: number) => void
  getTurnState: (entityId: string) => TurnState | undefined
}

export interface ConditionsSliceState {
  addCondition: (condition: EntityCondition) => void
  removeCondition: (conditionId: string) => void
  updateCondition: (conditionId: string, updates: Partial<EntityCondition>) => void
}

export interface FogSliceState {
  revealFog: (mapId: string, cells: Array<{ x: number; y: number }>) => void
  hideFog: (mapId: string, cells: Array<{ x: number; y: number }>) => void
}

export interface SidebarSliceState {
  allies: SidebarEntry[]
  enemies: SidebarEntry[]
  places: SidebarEntry[]
  addSidebarEntry: (category: SidebarCategory, entry: SidebarEntry) => void
  updateSidebarEntry: (category: SidebarCategory, id: string, updates: Partial<SidebarEntry>) => void
  removeSidebarEntry: (category: SidebarCategory, id: string) => void
  moveSidebarEntry: (fromCategory: SidebarCategory, toCategory: SidebarCategory, entryId: string) => void
  toggleEntryVisibility: (category: SidebarCategory, id: string) => void
  reparentPlace: (entryId: string, newParentId: string | null) => void
}

export interface TimerSliceState {
  timerSeconds: number
  timerRunning: boolean
  timerTargetName: string
  startTimer: (seconds: number, targetName: string) => void
  stopTimer: () => void
  tickTimer: () => void
  combatTimer: CombatTimerConfig | null
  setCombatTimer: (config: CombatTimerConfig | null) => void
}

export interface CombatLogSliceState {
  hiddenDiceResults: HiddenDiceResult[]
  addHiddenDiceResult: (result: HiddenDiceResult) => void
  clearHiddenDiceResults: () => void
  diceHistory: DiceRollRecord[]
  addDiceRoll: (roll: DiceRollRecord) => void
  clearDiceHistory: () => void
  combatLog: CombatLogEntry[]
  addCombatLogEntry: (entry: CombatLogEntry) => void
  clearCombatLog: () => void
  pendingGroupRoll: GroupRollRequest | null
  groupRollResults: GroupRollResult[]
  setPendingGroupRoll: (request: GroupRollRequest | null) => void
  addGroupRollResult: (result: GroupRollResult) => void
  clearGroupRollResults: () => void
}

export interface TimeSliceState {
  inGameTime: InGameTimeState | null
  setInGameTime: (time: InGameTimeState | null) => void
  advanceTimeSeconds: (seconds: number) => void
  advanceTimeDays: (days: number) => void
  restTracking: {
    lastLongRestSeconds: number | null
    lastShortRestSeconds: number | null
  } | null
  setRestTracking: (rt: { lastLongRestSeconds: number | null; lastShortRestSeconds: number | null } | null) => void
  activeLightSources: ActiveLightSource[]
  lightSource: (
    entityId: string,
    entityName: string,
    sourceName: string,
    durationSeconds: number,
    animation?: import('../../types/campaign').LightAnimation
  ) => void
  extinguishSource: (sourceId: string) => void
  checkExpiredSources: () => ActiveLightSource[]
  weatherOverride: {
    description: string
    temperature?: number
    temperatureUnit?: 'F' | 'C'
    windSpeed?: string
    mechanicalEffects?: string[]
    preset?: string
  } | null
  moonOverride: string | null
  savedWeatherPresets: Array<{
    name: string
    description: string
    temperature?: number
    temperatureUnit?: 'F' | 'C'
    windSpeed?: string
    mechanicalEffects?: string[]
    preset?: string
  }>
  showWeatherOverlay: boolean
  setWeatherOverride: (override: TimeSliceState['weatherOverride']) => void
  setMoonOverride: (override: string | null) => void
  setShowWeatherOverlay: (show: boolean) => void
  addSavedWeatherPreset: (preset: TimeSliceState['savedWeatherPresets'][number]) => void
  removeSavedWeatherPreset: (name: string) => void
  sessionLog: SessionLogEntry[]
  currentSessionId: string
  currentSessionLabel: string
  addLogEntry: (content: string, inGameTimestamp?: string) => void
  updateLogEntry: (entryId: string, content: string) => void
  deleteLogEntry: (entryId: string) => void
  startNewSession: () => void
  handouts: Handout[]
  addHandout: (handout: Handout) => void
  updateHandout: (id: string, updates: Partial<Handout>) => void
  removeHandout: (id: string) => void
}

export interface EffectsSliceState {
  customEffects: CustomEffect[]
  addCustomEffect: (effect: CustomEffect) => void
  removeCustomEffect: (id: string) => void
  getEffectsForToken: (entityId: string) => CustomEffect[]
  checkExpiredEffects: () => CustomEffect[]
  activeDiseases: ActiveDisease[]
  addDisease: (disease: ActiveDisease) => void
  updateDisease: (id: string, updates: Partial<ActiveDisease>) => void
  removeDisease: (id: string) => void
  activeCurses: ActiveCurse[]
  addCurse: (curse: ActiveCurse) => void
  updateCurse: (id: string, updates: Partial<ActiveCurse>) => void
  removeCurse: (id: string) => void
  activeEnvironmentalEffects: ActiveEnvironmentalEffect[]
  addEnvironmentalEffect: (effect: ActiveEnvironmentalEffect) => void
  removeEnvironmentalEffect: (id: string) => void
  placedTraps: PlacedTrap[]
  addPlacedTrap: (trap: PlacedTrap) => void
  removeTrap: (id: string) => void
  triggerTrap: (id: string) => void
  revealTrap: (id: string) => void
  updatePlacedTrap: (id: string, updates: Partial<PlacedTrap>) => void
}

export interface FloorSliceState {
  /** Currently viewed floor index (0-based). DM can switch freely; players auto-follow their token. */
  currentFloor: number
  setCurrentFloor: (floor: number) => void
}

export interface VisionSliceState {
  /** Currently visible cells (host-computed, synced to clients) */
  partyVisionCells: Array<{ x: number; y: number }>
  /** Set currently visible cells */
  setPartyVisionCells: (cells: Array<{ x: number; y: number }>) => void
  /** Append auto-explored cells to a map's fogOfWar.exploredCells, deduplicating */
  addExploredCells: (mapId: string, cells: Array<{ x: number; y: number }>) => void
  /** Remove specific explored cells from a map */
  removeExploredCells: (mapId: string, cells: Array<{ x: number; y: number }>) => void
  /** Reset all explored cells for a specific map */
  clearVision: (mapId: string) => void
  /** Reset all explored cells for all maps */
  clearAllVision: () => void
  /** Toggle dynamic fog on a map */
  setDynamicFogEnabled: (mapId: string, enabled: boolean) => void
}

export interface DrawingSliceState {
  addDrawing: (mapId: string, drawing: import('../../types/map').DrawingData) => void
  removeDrawing: (mapId: string, drawingId: string) => void
  clearDrawings: (mapId: string) => void
}

export interface RegionSliceState {
  addRegion: (mapId: string, region: SceneRegion) => void
  removeRegion: (mapId: string, regionId: string) => void
  updateRegion: (mapId: string, regionId: string, updates: Partial<SceneRegion>) => void
  clearRegions: (mapId: string) => void
}

export interface TriggerSliceState {
  triggers: DmTrigger[]
  addTrigger: (trigger: DmTrigger) => void
  removeTrigger: (triggerId: string) => void
  updateTrigger: (triggerId: string, updates: Partial<DmTrigger>) => void
  toggleTrigger: (triggerId: string) => void
  fireTrigger: (triggerId: string) => void
}

export interface OcclusionSliceState {
  addOcclusionTile: (mapId: string, tile: OcclusionTile) => void
  removeOcclusionTile: (mapId: string, tileId: string) => void
  updateOcclusionTile: (mapId: string, tileId: string, updates: Partial<OcclusionTile>) => void
}

export interface DarknessZoneSliceState {
  addDarknessZone: (mapId: string, zone: import('../../types/map').DarknessZone) => void
  removeDarknessZone: (mapId: string, zoneId: string) => void
  updateDarknessZone: (mapId: string, zoneId: string, updates: Partial<import('../../types/map').DarknessZone>) => void
}

export interface JournalSliceState {
  sharedJournal: SharedJournalEntry[]
  addJournalEntry: (entry: SharedJournalEntry) => void
  updateJournalEntry: (
    id: string,
    updates: Partial<Pick<SharedJournalEntry, 'title' | 'content' | 'visibility'>>
  ) => void
  deleteJournalEntry: (id: string) => void
  setSharedJournal: (entries: SharedJournalEntry[]) => void
}

export interface PartyInventorySliceState {
  partyInventory: PartyInventory
  addPartyItem: (item: PartyInventoryItem) => void
  removePartyItem: (itemId: string) => void
  updatePartyItemQuantity: (itemId: string, quantity: number) => void
  addPartyCurrency: (currency: Partial<PartyInventory['currency']>) => void
  spendPartyCurrency: (currency: Partial<PartyInventory['currency']>) => boolean
  transferItemToPlayer: (itemId: string, playerId: string) => void
  splitGold: (playerCount: number) => number
}

export interface TradeEphemeralState {
  pendingTradeOffer: TradeRequestPayload | null
  setPendingTradeOffer: (offer: TradeRequestPayload | null) => void
  clearPendingTradeOffer: () => void
  pendingTradeResult: { tradeId: string; accepted: boolean; summary: string } | null
  setPendingTradeResult: (result: { tradeId: string; accepted: boolean; summary: string } | null) => void
  clearPendingTradeResult: () => void
  inspectedCharacterData: unknown
  setInspectedCharacter: (data: unknown) => void
  clearInspectedCharacter: () => void
}

// --- Game flow actions (on the combined store, not a separate slice) ---

export interface GameFlowState {
  setPaused: (paused: boolean) => void
  setTurnMode: (mode: 'initiative' | 'free') => void
  reset: () => void
  loadGameState: (
    state:
      | (Partial<GameState> & {
          allies?: SidebarEntry[]
          enemies?: SidebarEntry[]
          places?: SidebarEntry[]
          inGameTime?: InGameTimeState | null
          restTracking?: { lastLongRestSeconds: number | null; lastShortRestSeconds: number | null } | null
          activeLightSources?: ActiveLightSource[]
          sessionLog?: SessionLogEntry[]
          currentSessionId?: string
          currentSessionLabel?: string
          weatherOverride?: GameStoreState['weatherOverride']
          moonOverride?: string | null
          savedWeatherPresets?: GameStoreState['savedWeatherPresets']
          handouts?: Handout[]
          combatTimer?: CombatTimerConfig | null
          sharedJournal?: SharedJournalEntry[]
          partyInventory?: PartyInventory
        })
      | Record<string, unknown>
  ) => void
  setUnderwaterCombat: (enabled: boolean) => void
  setFlankingEnabled: (enabled: boolean) => void
  setGroupInitiativeEnabled: (enabled: boolean) => void
  setDiagonalRule: (rule: 'standard' | 'alternate') => void
  setAmbientLight: (level: 'bright' | 'dim' | 'darkness') => void
  setTravelPace: (pace: 'fast' | 'normal' | 'slow' | null) => void
  setMarchingOrder: (order: string[]) => void
}

// --- Reaction prompt state ---

export interface ReactionPromptState {
  promptId: string
  targetEntityId: string
  triggerType: 'shield' | 'counterspell' | 'absorb-elements' | 'silvery-barbs'
  triggerContext: {
    attackRoll?: number
    attackerName?: string
    spellName?: string
    spellLevel?: number
    damageType?: string
  }
}

export interface ReactionPromptSliceState {
  pendingReactionPrompt: ReactionPromptState | null
  setPendingReactionPrompt: (prompt: ReactionPromptState | null) => void
}

// --- Combined store type ---

export type GameStoreState = GameState &
  ShopSliceState &
  MapTokenSliceState &
  InitiativeSliceState &
  ConditionsSliceState &
  FogSliceState &
  FloorSliceState &
  VisionSliceState &
  DrawingSliceState &
  RegionSliceState &
  TriggerSliceState &
  OcclusionSliceState &
  DarknessZoneSliceState &
  SidebarSliceState &
  TimerSliceState &
  CombatLogSliceState &
  TimeSliceState &
  EffectsSliceState &
  ReactionPromptSliceState &
  JournalSliceState &
  PartyInventorySliceState &
  TradeEphemeralState &
  GameFlowState
