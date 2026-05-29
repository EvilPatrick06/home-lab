import { BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { PluginManifest } from '../../shared/plugin-types'
import { loadAllContentPackData } from '../plugins/content-pack-loader'
import { getEnabledPluginIds, setPluginEnabled } from '../plugins/plugin-config'
import { installFromZip, uninstallPlugin } from '../plugins/plugin-installer'
import { scanPlugins } from '../plugins/plugin-scanner'
import { deletePluginStorage, getPluginStorage, setPluginStorage } from '../plugins/plugin-storage'
import { handle } from './_safe'

// Phase 22i — tightened plugin-id format. Conservative charset (alnum + -_.,
// must start alnum, ≤64) blocks path-traversal (`../`), separators, and unicode
// tricks before the id is ever used to build a file path. All plugin handlers
// route their id through parsePluginId, so this one schema hardens every site.
const PluginIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9\-_.]{0,63}$/i, 'Invalid plugin id format')
const PluginKeySchema = z.string().min(1).max(500)

// Exported for unit testing (Phase 22i).
export function parsePluginId(raw: unknown): { ok: true; id: string } | { ok: false; err: string } {
  const r = PluginIdSchema.safeParse(raw)
  if (r.success) {
    return { ok: true, id: r.data }
  }
  return { ok: false, err: r.error.message }
}

export function registerPluginHandlers(): void {
  handle(IPC_CHANNELS.PLUGIN_SCAN, async () => {
    return scanPlugins()
  })

  handle(IPC_CHANNELS.PLUGIN_ENABLE, async (_event, pluginId: unknown) => {
    const p = parsePluginId(pluginId)
    if (!p.ok) {
      return { success: false, error: p.err }
    }
    await setPluginEnabled(p.id, true)
    return { success: true }
  })

  handle(IPC_CHANNELS.PLUGIN_DISABLE, async (_event, pluginId: unknown) => {
    const p = parsePluginId(pluginId)
    if (!p.ok) {
      return { success: false, error: p.err }
    }
    await setPluginEnabled(p.id, false)
    return { success: true }
  })

  handle(IPC_CHANNELS.PLUGIN_LOAD_CONTENT, async (_event, pluginId: unknown, manifest: PluginManifest) => {
    const p = parsePluginId(pluginId)
    if (!p.ok) {
      return { error: p.err }
    }
    return loadAllContentPackData(p.id, manifest)
  })

  handle(IPC_CHANNELS.PLUGIN_GET_ENABLED, async () => {
    const ids = await getEnabledPluginIds()
    return Array.from(ids)
  })

  handle(IPC_CHANNELS.PLUGIN_INSTALL, async () => {
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

  handle(IPC_CHANNELS.PLUGIN_UNINSTALL, async (_event, pluginId: unknown) => {
    const p = parsePluginId(pluginId)
    if (!p.ok) {
      return { success: false, error: p.err }
    }
    return uninstallPlugin(p.id)
  })

  // --- Per-plugin storage ---

  handle(IPC_CHANNELS.PLUGIN_STORAGE_GET, async (_event, pluginId: unknown, key: unknown) => {
    const p = parsePluginId(pluginId)
    const k = PluginKeySchema.safeParse(key)
    if (!p.ok || !k.success) {
      return null
    }
    return getPluginStorage(p.id, k.data)
  })

  handle(IPC_CHANNELS.PLUGIN_STORAGE_SET, async (_event, pluginId: unknown, key: unknown, value: unknown) => {
    const p = parsePluginId(pluginId)
    const k = PluginKeySchema.safeParse(key)
    if (!p.ok || !k.success) {
      return { success: false, error: 'Invalid plugin id or key' }
    }
    return setPluginStorage(p.id, k.data, value)
  })

  handle(IPC_CHANNELS.PLUGIN_STORAGE_DELETE, async (_event, pluginId: unknown, key: unknown) => {
    const p = parsePluginId(pluginId)
    const k = PluginKeySchema.safeParse(key)
    if (!p.ok || !k.success) {
      return { success: false, error: 'Invalid plugin id or key' }
    }
    return deletePluginStorage(p.id, k.data)
  })
}
