// ---------------------------------------------------------------------------
// Undo / Redo manager for DM actions
// Module-level state with exported functions -- no class, no store dependency.
// ---------------------------------------------------------------------------

export interface UndoableAction {
  type: string
  description: string
  undo: () => void
  redo: () => void
}

// ---- internal stacks ------------------------------------------------------

const MAX_HISTORY = 20

let undoStack: UndoableAction[] = []
let redoStack: UndoableAction[] = []

// ---- public API -----------------------------------------------------------

/** Push an action onto the undo stack and clear the redo stack. */
export function push(action: UndoableAction): void {
  undoStack.push(action)
  if (undoStack.length > MAX_HISTORY) {
    undoStack = undoStack.slice(undoStack.length - MAX_HISTORY)
  }
  redoStack = []
}

/** Undo the most recent action. */
export function undo(): void {
  const action = undoStack.pop()
  if (!action) return
  action.undo()
  redoStack.push(action)
}

/** Redo the most recently undone action. */
export function redo(): void {
  const action = redoStack.pop()
  if (!action) return
  action.redo()
  undoStack.push(action)
}

export function canUndo(): boolean {
  return undoStack.length > 0
}

export function canRedo(): boolean {
  return redoStack.length > 0
}

/** Clear both stacks. */
export function clear(): void {
  undoStack = []
  redoStack = []
}

/** Return the current length of the undo stack. */
export function getHistoryLength(): number {
  return undoStack.length
}

// ---------------------------------------------------------------------------
// Helper factory functions
// ---------------------------------------------------------------------------

/**
 * Create an undoable token-move action.
 *
 * @param mapId     - The map the token lives on.
 * @param tokenId   - The token being moved.
 * @param fromX     - Original grid X.
 * @param fromY     - Original grid Y.
 * @param toX       - Destination grid X.
 * @param toY       - Destination grid Y.
 * @param moveToken - The function that actually performs the move
 *                    (typically `useGameStore.getState().moveToken`).
 */
export function createTokenMoveAction(
  mapId: string,
  tokenId: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  moveToken: (mapId: string, tokenId: string, gridX: number, gridY: number) => void
): UndoableAction {
  return {
    type: 'token-move',
    description: `Move token ${tokenId} from (${fromX},${fromY}) to (${toX},${toY})`,
    undo: () => moveToken(mapId, tokenId, fromX, fromY),
    redo: () => moveToken(mapId, tokenId, toX, toY)
  }
}

/**
 * Create an undoable fog-of-war change action.
 *
 * @param mapId     - The map whose fog is changing.
 * @param cells     - The cells being revealed or hidden.
 * @param isReveal  - `true` when the original action reveals cells,
 *                    `false` when it hides them.
 * @param revealFog - Function that reveals fog cells
 *                    (typically `useGameStore.getState().revealFog`).
 * @param hideFog   - Function that hides fog cells
 *                    (typically `useGameStore.getState().hideFog`).
 */
export function createFogAction(
  mapId: string,
  cells: Array<{ x: number; y: number }>,
  isReveal: boolean,
  revealFog: (mapId: string, cells: Array<{ x: number; y: number }>) => void,
  hideFog: (mapId: string, cells: Array<{ x: number; y: number }>) => void
): UndoableAction {
  return {
    type: 'fog-change',
    description: isReveal ? `Reveal ${cells.length} fog cell(s)` : `Hide ${cells.length} fog cell(s)`,
    undo: () => (isReveal ? hideFog(mapId, cells) : revealFog(mapId, cells)),
    redo: () => (isReveal ? revealFog(mapId, cells) : hideFog(mapId, cells))
  }
}
