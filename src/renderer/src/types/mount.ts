// Mount & Vehicle Types (PHB/DMG 2024)

export interface MountStatBlock {
  id: string
  name: string
  size: 'medium' | 'large' | 'huge' | 'gargantuan'
  /** Grid size (e.g., 1 for Medium, 2 for Large, 3 for Huge) */
  sizeX: number
  sizeY: number
  ac: number
  hp: number
  speed: number
  swimSpeed?: number
  flySpeed?: number
  climbSpeed?: number
  str: number
  dex: number
  con: number
  /** Whether this mount can be controlled by its rider */
  canBeControlled: boolean
  /** Type category for grouping in UI */
  category: 'land' | 'flying' | 'aquatic' | 'exotic'
  /** Brief description */
  description: string
  /** Gold cost (PHB 2024 equipment table) */
  cost?: number
}

export interface VehicleStatBlock {
  id: string
  name: string
  size: 'large' | 'huge' | 'gargantuan'
  sizeX: number
  sizeY: number
  ac: number
  hp: number
  speed: number
  /** Minimum crew required to operate */
  crewMin: number
  /** Maximum crew capacity */
  crewMax: number
  /** Passenger capacity (beyond crew) */
  passengers: number
  /** Cargo capacity in tons */
  cargoTons: number
  /** Type category */
  category: 'land' | 'water' | 'air'
  /** Gold cost (DMG 2024) */
  cost: number
  description: string
}

/** Mounted combat state tracked per rider in TurnState */
export interface MountedCombatState {
  /** Token ID of the mount */
  mountTokenId: string
  /** Controlled: rider dictates movement/actions. Independent: mount acts on own initiative. */
  type: 'controlled' | 'independent'
  /** Whether the rider has already used the mount's movement this turn */
  mountMovementUsed: boolean
}
