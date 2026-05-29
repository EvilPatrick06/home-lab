import type { TurnState } from '../../../../types/game-state'
import type { GameMap, MapToken } from '../../../../types/map'
import type { AoEConfig } from '../aoe-overlay'

/** Active tool selection for the map canvas (mirrors the toolbar tool set). */
export type MapCanvasActiveTool =
  | 'select'
  | 'token'
  | 'fog-reveal'
  | 'fog-hide'
  | 'measure'
  | 'check-los'
  | 'terrain'
  | 'wall'
  | 'fill'
  | 'draw-free'
  | 'draw-line'
  | 'draw-rect'
  | 'draw-circle'
  | 'draw-text'

export interface MapCanvasProps {
  map: GameMap | null
  isHost: boolean
  myCharacterId?: string | null
  selectedTokenIds: string[]
  activeTool: MapCanvasActiveTool
  drawingStrokeWidth?: number
  drawingColor?: string
  fogBrushSize: number
  onTokenMove: (tokenId: string, gridX: number, gridY: number) => void
  onTokenSelect: (tokenIds: string[]) => void
  onCellClick: (gridX: number, gridY: number) => void
  onWallPlace?: (x1: number, y1: number, x2: number, y2: number) => void
  onDoorToggle?: (wallId: string) => void
  turnState?: TurnState | null
  isInitiativeMode?: boolean
  activeAoE?: AoEConfig | null
  /** Entity ID of the creature whose turn it is (for active turn glow) */
  activeEntityId?: string | null
  /** Callback for right-click on a token (context menu) */
  onTokenContextMenu?: (x: number, y: number, token: MapToken, mapId: string, selectedTokenIds: string[]) => void
  /** Callback for right-click on an empty cell (DM only) */
  onEmptyCellContextMenu?: (gridX: number, gridY: number, screenX: number, screenY: number) => void
  /** Phase 16b — click on a map pin (open linked journal/NPC/location, or surface the label). */
  onPinClick?: (pin: import('../../../../types/map').MapPin) => void
}
