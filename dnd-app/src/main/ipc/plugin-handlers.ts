import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { PluginManifest } from '../../shared/plugin-types'
import { loadAllContentPackData } from '../plugins/content-pack-loader'
import { getEnabledPluginIds, setPluginEnabled } from '../plugins/plugin-config'
import { installFromZip, uninstallPlugin } from '../plugins/plugin-installer'
import { scanPlugins } from '../plugins/plugin-scanner'
import { deletePluginStorage, getPluginStorage, setPluginStorage } from '../plugins/plugin-storage'

export function registerPluginHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PLUGIN_SCAN, async () => {
    return scanPlugins()
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_ENABLE, async (_event, pluginId: string) => {
    await setPluginEnabled(pluginId, true)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_DISABLE, async (_event, pluginId: string) => {
    await setPluginEnabled(pluginId, false)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_LOAD_CONTENT, async (_event, pluginId: string, manifest: PluginManifest) => {
    return loadAllContentPackData(pluginId, manifest)
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

  ipcMain.handle(IPC_CHANNELS.PLUGIN_UNINSTALL, async (_event, pluginId: string) => {
    return uninstallPlugin(pluginId)
  })

  // --- Per-plugin storage ---

  ipcMain.handle(IPC_CHANNELS.PLUGIN_STORAGE_GET, async (_event, pluginId: string, key: string) => {
    return getPluginStorage(pluginId, key)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_STORAGE_SET, async (_event, pluginId: string, key: string, value: unknown) => {
    return setPluginStorage(pluginId, key, value)
  })

  ipcMain.handle(IPC_CHANNELS.PLUGIN_STORAGE_DELETE, async (_event, pluginId: string, key: string) => {
    return deletePluginStorage(pluginId, key)
  })
}
