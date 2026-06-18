export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export type PeerRole = 'host' | 'player' | 'spectator'

export interface PeerInfo {
  peerId: string
  /** Stable per-installation identifier (localStorage-persisted UUID). Canonical identity for bans, registry filtering, and reconnect-resync. */
  clientId: string
  /** Functional role in the session. Filled in 29b as 'player' for joiners; spectator branch lands in 29e. */
  role: PeerRole
  displayName: string
  characterId: string | null
  characterName: string | null
  isReady: boolean
  /** Network role: owns the PeerJS mesh. Phase 30 decouples this from DM authority. */
  isHost: boolean
  color?: string
  isCoDM?: boolean
  /**
   * Phase 30d — explicit DM (game-rule) authority, decoupled from `isHost`
   * (network host). When undefined it falls back to `isHost` (legacy: the host
   * is the DM), so existing sessions are unchanged. Set explicitly so a non-host
   * player can be the DM, or the network host can hand off DM authority (30e).
   */
  isDM?: boolean
  /** Phase 29 — explicit campaign role id (into `campaign.permissions.roles`).
   * When unset, `hasPermission` derives a built-in role from `isHost`/`isCoDM`/`role`. */
  roleId?: string
  /** Transiently set by the host heartbeat check when a peer stops responding but hasn't yet been removed. */
  isDisconnected?: boolean
  latencyMs?: number
  /** Phase 29j: peer-advertised wire-format capabilities. The host only ships
   * tagged binary frames (msgpack ± gzip) when `msgpack === true`. */
  clientCapabilities?: {
    msgpack?: boolean
  }
}

export type ShopItemCategory =
  | 'weapon'
  | 'armor'
  | 'potion'
  | 'scroll'
  | 'wondrous'
  | 'tool'
  | 'adventuring'
  | 'trade'
  | 'other'

export type ShopItemRarity = 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact'

export interface ShopItem {
  id: string
  name: string
  category: string
  price: { cp?: number; sp?: number; gp?: number; pp?: number }
  quantity: number
  description?: string
  weight?: number
  bulk?: number
  shopCategory?: ShopItemCategory
  rarity?: ShopItemRarity
  stockLimit?: number
  stockRemaining?: number
  dmNotes?: string
  hiddenFromPlayerIds?: string[]
  isHidden?: boolean
}

export interface GameStateFullPayload {
  peers: PeerInfo[]
  campaignId?: string
  gameState?: NetworkGameState
}

export interface NetworkGameState {
  activeMapId: string | null
  maps: NetworkMap[]
  turnMode: 'initiative' | 'free'
  initiative: unknown
  round: number
  conditions: unknown[]
  isPaused: boolean
  turnStates: Record<string, unknown>
  underwaterCombat: boolean
  flankingEnabled: boolean
  groupInitiativeEnabled: boolean
  ambientLight: 'bright' | 'dim' | 'darkness'
  diagonalRule: 'standard' | 'alternate'
  travelPace: 'fast' | 'normal' | 'slow' | null
  marchingOrder: string[]
  inGameTime: { totalSeconds: number } | null
  allies: unknown[]
  enemies: unknown[]
  places: unknown[]
  handouts: unknown[]
  shopOpen?: boolean
  shopName?: string
  shopInventory?: ShopItem[]
  customEffects?: unknown[]
  placedTraps?: unknown[]
  sessionLog?: unknown[]
  combatLog?: unknown[]
  partyVisionCells?: Array<{ x: number; y: number }>
  // Phase 35 — cinematic scene state (wire shape enforced by SceneModePayloadSchema; host-built/trusted).
  sceneMode?: unknown
}

export interface NetworkMap {
  id: string
  name: string
  campaignId: string
  imageData?: string
  imagePath: string
  width: number
  height: number
  grid: unknown
  tokens: unknown[]
  fogOfWar: unknown
  wallSegments?: unknown[]
  terrain: unknown[]
  createdAt: string
}

export const PLAYER_COLORS = [
  '#F59E0B',
  '#EF4444',
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
  '#84CC16',
  '#6366F1',
  '#14B8A6',
  '#E11D48'
]
