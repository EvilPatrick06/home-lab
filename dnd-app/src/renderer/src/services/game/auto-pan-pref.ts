/**
 * Phase 16a — per-viewer "auto-pan to the active token on turn change" preference.
 *
 * Stored in localStorage so each client (DM or player) can override independently — the camera
 * following initiative is a per-viewer comfort setting, not campaign state. Defaults to ON.
 */
const KEY = 'dnd-vtt-auto-pan-on-turn-change'

export function getAutoPanOnTurnChange(): boolean {
  return localStorage.getItem(KEY) !== 'false'
}

export function setAutoPanOnTurnChange(enabled: boolean): void {
  localStorage.setItem(KEY, enabled ? 'true' : 'false')
}
