/**
 * Pure grid-coordinate helpers for the map canvas hover readout (Phase 16g).
 *
 * Extracted from MapCanvas.tsx as a behavior-preserving decomposition — these are
 * stateless functions + a localStorage key constant with no PixiJS / React coupling.
 */

/** Per-viewer localStorage key for the hover grid-coordinate HUD toggle. */
export const GRID_HUD_KEY = 'dnd-vtt-grid-coord-hud'

/** Phase 16g — spreadsheet-style column label (0→A, 25→Z, 26→AA, …). */
function columnLabel(n: number): string {
  if (n < 0) return String(n)
  let s = ''
  let x = n
  do {
    s = String.fromCharCode(65 + (x % 26)) + s
    x = Math.floor(x / 26) - 1
  } while (x >= 0)
  return s
}

/** Phase 16g — hover grid-coordinate label: "A1" for square grids, axial "x,y" for hex/gridless. */
export function formatGridLabel(gridX: number, gridY: number, gridType: string): string {
  if (gridType === 'square') return `${columnLabel(gridX)}${gridY + 1}`
  return `${gridX},${gridY}`
}
