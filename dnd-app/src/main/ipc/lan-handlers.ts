/**
 * LAN discovery IPC handlers. (Phase 29g)
 *
 * Renderer can request a scan, publish a hosted game, and tear them
 * down. Found / removed events flow back to the renderer via
 * BrowserWindow.webContents.send (see lan-discovery.ts).
 */

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  probeSignalingServer,
  publishLan,
  startLanScan,
  stopLanScan,
  teardownLanDiscovery,
  unpublishLan
} from '../lan-discovery'
import { logToFile } from '../log'
import { handle } from './_safe'

export function registerLanHandlers(): void {
  handle(IPC_CHANNELS.LAN_START_SCAN, () => {
    try {
      return startLanScan()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logToFile('ERROR', `[lan-handlers] start-scan failed: ${message}`)
      return { ok: false, error: message }
    }
  })

  handle(IPC_CHANNELS.LAN_STOP_SCAN, () => {
    stopLanScan()
    return { ok: true }
  })

  handle(IPC_CHANNELS.LAN_PUBLISH, (_event, payload) => {
    return publishLan(payload)
  })

  handle(IPC_CHANNELS.LAN_UNPUBLISH, () => {
    unpublishLan()
    return { ok: true }
  })

  // On-demand signaling probe so the Multiplayer settings badge gets a fresh
  // result the moment it mounts (the periodic probe + boot probe still run).
  handle(IPC_CHANNELS.BMO_PROBE_SIGNALING, () => {
    void probeSignalingServer()
    return { ok: true }
  })

  process.on('beforeExit', teardownLanDiscovery)
  logToFile('INFO', '[lan-handlers] LAN discovery handlers registered')
}
