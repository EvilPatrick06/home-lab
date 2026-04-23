export interface GameMap {
  id: string
  name: string
  campaignId: string

  imagePath: string
  width: number
  height: number

  grid: GridSettings
  tokens: MapToken[]
  fogOfWar: FogOfWarData
  wallSegments?: WallSegment[]
  terrain: TerrainCell[]
  drawings?: DrawingData[]
  regions?: SceneRegion[]
  darknessZones?: DarknessZone[]
  occlusionTiles?: OcclusionTile[]
  floors?: Array<{ id: string; name: string }>
  audioEmitters?: Array<{
    id: string
    x: number
    y: number
    soundId: string
    displayName: string
    radius: number
    volume: number
    spatial: boolean
    playing?: boolean
  }>

  createdAt: string
}

export interface TerrainCell {
  x: number
  y: number
  type: 'difficult' | 'hazard' | 'water' | 'climbing' | 'portal'
  movementCost: number // 2 for difficult terrain, water, or climbing (without swim/climb speed)
  /** Hazard subtype for damage on entry (C5) */
  hazardType?: 'fire' | 'acid' | 'pit' | 'spikes'
  /** Damage dealt by hazard on entry */
  hazardDamage?: number
  /** Portal destination: target map and grid position */
  portalTarget?: {
    mapId: string
    gridX: number
    gridY: number
  }
  /** Floor index this terrain cell is on (for multi-floor maps). Undefined = floor 0. */
  floor?: number
}

/** Darkvision: derived from species data — Elf, Dwarf, Gnome, Tiefling, Half-Elf */
export const DARKVISION_SPECIES = ['elf', 'dwarf', 'gnome', 'tiefling', 'half-elf']

export interface GridSettings {
  enabled: boolean
  cellSize: number
  offsetX: number
  offsetY: number
  color: string
  opacity: number
  type: 'square' | 'hex' | 'hex-flat' | 'hex-pointy' | 'gridless'
}

export interface MapToken {
  id: string
  entityId: string
  entityType: 'player' | 'npc' | 'enemy'
  label: string
  imagePath?: string

  gridX: number
  gridY: number
  /** Elevation in feet (0 = ground level). Positive = flying/elevated, negative = below ground. */
  elevation?: number
  /** Floor index this token is on (for multi-floor maps) */
  floor?: number

  sizeX: number
  sizeY: number

  visibleToPlayers: boolean
  /** Whether the token's name label is visible to players (default true for PCs, false for monsters) */
  nameVisible?: boolean
  conditions: string[]
  currentHP?: number
  maxHP?: number
  ac?: number
  monsterStatBlockId?: string
  walkSpeed?: number
  initiativeModifier?: number

  /** Damage resistances (e.g., "fire", "bludgeoning") */
  resistances?: string[]
  /** Damage vulnerabilities */
  vulnerabilities?: string[]
  /** Damage immunities */
  immunities?: string[]
  /** Whether this creature has darkvision */
  darkvision?: boolean
  /** Darkvision range in feet (e.g. 60, 120). Overrides darkvision boolean when set. */
  darkvisionRange?: number
  /** Swim speed in feet (0 or undefined = no swim speed) */
  swimSpeed?: number
  /** Climb speed in feet (0 or undefined = no climb speed) */
  climbSpeed?: number
  /** Fly speed in feet (0 or undefined = no fly speed) */
  flySpeed?: number
  /** Special senses (informational, for DM adjudication) */
  specialSenses?: Array<{ type: 'blindsight' | 'tremorsense' | 'truesight'; range: number }>
  /** Entity ID of the rider on this mount (Phase 4 - mounted combat) */
  riderId?: string
  /** Character ID of the companion's owner */
  ownerEntityId?: string
  /** Companion type for visual/behavioral differentiation */
  companionType?: 'familiar' | 'wildShape' | 'steed' | 'summoned'
  /** Spell that created this token */
  sourceSpell?: string

  /** Save modifier for unarmed strike grapple/shove contests */
  saveMod?: number
  /** Custom token color (hex string) */
  color?: string
  /** Custom border color (hex string) */
  borderColor?: string
  /** Border style for rendering */
  borderStyle?: 'solid' | 'dashed' | 'double'
  /** Font size for the token label (8-24) */
  labelFontSize?: number
  /** Aura configuration for visual range indicators */
  aura?: {
    /** Aura radius in feet */
    radius: number
    /** Aura color as hex string */
    color: string
    /** Aura opacity (0-1) */
    opacity: number
    /** Aura visibility: 'all' = everyone, 'dm-only' = host only */
    visibility: 'all' | 'dm-only'
  }
}

// ─── Scene Regions & Trigger Zones ─────────────────────────────

export type RegionShape =
  | { type: 'circle'; centerX: number; centerY: number; radius: number }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> }
  | { type: 'rectangle'; x: number; y: number; width: number; height: number }

export type RegionTrigger = 'enter' | 'leave' | 'start-turn' | 'end-turn'

export type RegionAction =
  | { type: 'alert-dm'; message: string }
  | { type: 'teleport'; targetMapId: string; targetGridX: number; targetGridY: number }
  | { type: 'apply-condition'; condition: string; duration?: number | 'permanent' }

export interface SceneRegion {
  id: string
  name: string
  shape: RegionShape
  trigger: RegionTrigger
  action: RegionAction
  enabled: boolean
  visibleToPlayers: boolean
  /** If true, the region disables itself after firing once */
  oneShot: boolean
  color?: string
  floor?: number
}

// ─── Occlusion / Foreground Layer ─────────────────────────────

export interface OcclusionTile {
  id: string
  imagePath: string
  x: number
  y: number
  width: number
  height: number
  floor?: number
  fadeOnProximity: boolean
  fadeRadius: number
}

export interface WallSegment {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  type: 'solid' | 'door' | 'window' | 'one-way' | 'transparent'
  isOpen?: boolean
  /** Direction angle in degrees for one-way walls. Defines the blocked side's facing. */
  oneWayDirection?: number
  /** Floor index this wall is on (for multi-floor maps). Undefined = floor 0. */
  floor?: number
}

// ─── Darkness Zones ───────────────────────────────────────────

export interface DarknessZone {
  id: string
  x: number
  y: number
  radius: number
  floor?: number
  magicLevel?: 'nonmagical' | 'darkness' | 'deeper-darkness'
}

export interface FogOfWarData {
  enabled: boolean
  revealedCells: Array<{ x: number; y: number }>
  /** Cells auto-revealed by player movement (shown dimmed when out of current vision) */
  exploredCells?: Array<{ x: number; y: number }>
  /** DM toggle for automatic vision-driven fog reveal */
  dynamicFogEnabled?: boolean
}

// ─── Drawing / Annotation ─────────────────────────────────────

export type DrawingToolType = 'draw-free' | 'draw-line' | 'draw-rect' | 'draw-circle' | 'draw-text'

export interface DrawingData {
  id: string
  type: DrawingToolType
  /** Points in pixel coordinates. For free: many points; line: 2; rect: 2 (topLeft, bottomRight); circle: 2 (center, edge) */
  points: Array<{ x: number; y: number }>
  color: string
  strokeWidth: number
  /** Text content for 'draw-text' type */
  text?: string
  /** Whether this drawing is visible to players (DM can create hidden annotations) */
  visibleToPlayers?: boolean
  /** Floor index this drawing is on (for multi-floor maps). Undefined = floor 0. */
  floor?: number
}
