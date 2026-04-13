/**
 * BMO Pi Bridge: Sync IPC handlers.
 *
 * - Starts the sync receiver HTTP server (Pi → VTT)
 * - Registers IPC handlers for the renderer to push state to the Pi (VTT → Pi)
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { sendGameStateToPi, sendInitiativeToPi, startSyncReceiver, stopSyncReceiver } from '../bmo-bridge'
import { logToFile } from '../log'

export function registerBmoSyncHandlers(): void {
  // Start the sync receiver so the Pi can push events to us
  startSyncReceiver()

  // Renderer pushes initiative state → we forward to Pi
  ipcMain.handle(IPC_CHANNELS.BMO_SYNC_INITIATIVE, async (_event, initiative) => {
    try {
      const result = await sendInitiativeToPi(initiative)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logToFile('ERROR', `[bmo-sync] Failed to send initiative to Pi: ${message}`)
      return { ok: false, error: message }
    }
  })

  // Renderer pushes game state snapshot → we forward to Pi
  ipcMain.handle(IPC_CHANNELS.BMO_SYNC_SEND_STATE, async (_event, state) => {
    try {
      const result = await sendGameStateToPi(state)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logToFile('ERROR', `[bmo-sync] Failed to send game state to Pi: ${message}`)
      return { ok: false, error: message }
    }
  })

  // Clean up on app quit
  process.on('beforeExit', () => {
    stopSyncReceiver()
  })

  logToFile('INFO', '[bmo-sync] Sync handlers registered')
}
