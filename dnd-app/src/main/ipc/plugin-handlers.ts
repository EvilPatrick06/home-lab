import { BrowserWindow, dialog, ipcMain } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { PluginManifest } from '../../shared/plugin-types'
import { loadAllContentPackData } from '../plugins/content-pack-loader'
import { getEnabledPluginIds, setPluginEnabled } from '../plugins/plugin-config'
import { installFromZip, uninstallPlugin } from '../plugins/plugin-installer'
import { scanPlugins } from '../plugins/plugin-scanner'
import { deletePluginStorage, getPluginStorage, setPluginStorage } from '../plugins/plugin-storage'

const PluginIdSchema = z.string().min(1).max(200)
const PluginKeySchema = z.string().min(1).max(500)

function parsePluginId(raw: unknown): { ok: true; id: string } | { ok: false; err: string } {
  const r = PluginIdSchema.safeParse(raw)
  if (r.success) {
    return { ok: true, id: r.data }
  }
  return { ok: false, err: r.error.message }
}

export function registerPluginHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PLUGIN_SCAN, async () => {
    return scanPlugins()
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_ENABLE, async (_event, pluginId: unknown) => {
    const p = parsePluginId(pluginId)
    if (!p.ok) {
      return { success: false, error: p.err }
    }
    await setPluginEnabled(p.id, true)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_DISABLE, async (_event, pluginId: unknown) => {
    const p = parsePluginId(pluginId)
    if (!p.ok) {
      return { success: false, error: p.err }
    }
    await setPluginEnabled(p.id, false)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_LOAD_CONTENT, async (_event, pluginId: unknown, manifest: PluginManifest) => {
    const p = parsePluginId(pluginId)
    if (!p.ok) {
      return { error: p.err }
    }
    return loadAllContentPackData(p.id, manifest)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_ENABLED, async () => {
    const ids = await getEnabledPluginIds()
    return Array.from(ids)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_INSTALL, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Install Plugin',
      filters: [{ name: 'Plugin Pack', extensions: ['zip', 'dndpack'] }],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Cancelled' }
    }

    return installFromZip(result.filePaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_UNINSTALL, async (_event, pluginId: unknown) => {
    const p = parsePluginId(pluginId)
    if (!p.ok) {
      return { success: false, error: p.err }
    }
    return uninstallPlugin(p.id)
  })

  // --- Per-plugin storage ---

  ipcMain.handle(IPC_CHANNELS.PLUGIN_STORAGE_GET, async (_event, pluginId: unknown, key: unknown) => {
    const p = parsePluginId(pluginId)
    const k = PluginKeySchema.safeParse(key)
    if (!p.ok || !k.success) {
      return null
    }
    return getPluginStorage(p.id, k.data)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_STORAGE_SET, async (_event, pluginId: unknown, key: unknown, value: unknown) => {
    const p = parsePluginId(pluginId)
    const k = PluginKeySchema.safeParse(key)
    if (!p.ok || !k.success) {
      return { success: false, error: 'Invalid plugin id or key' }
    }
    return setPluginStorage(p.id, k.data, value)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_STORAGE_DELETE, async (_event, pluginId: unknown, key: unknown) => {
    const p = parsePluginId(pluginId)
    const k = PluginKeySchema.safeParse(key)
    if (!p.ok || !k.success) {
      return { success: false, error: 'Invalid plugin id or key' }
    }
    return deletePluginStorage(p.id, k.data)
  })
}
