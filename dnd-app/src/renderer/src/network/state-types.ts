export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface PeerInfo {
  peerId: string
  displayName: string
  characterId: string | null
  characterName: string | null
  isReady: boolean
  isHost: boolean
  color?: string
  isCoDM?: boolean
  /** Transiently set by the host heartbeat check when a peer stops responding but hasn't yet been removed. */
  isDisconnected?: boolean
  latencyMs?: number
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
