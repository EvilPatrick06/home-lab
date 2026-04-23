import { create } from 'zustand'
import type { PluginStatus } from '../../../shared/plugin-types'
import { getLoadedPlugin, type LoadedPlugin, loadPlugin, unloadPlugin } from '../services/plugin-system/plugin-registry'
import { useDataStore } from './use-data-store'

type _LoadedPlugin = LoadedPlugin

interface PluginStoreState {
  plugins: PluginStatus[]
  initialized: boolean

  initPlugins: () => Promise<void>
  enablePlugin: (id: string) => Promise<void>
  disablePlugin: (id: string) => Promise<void>
  installPlugin: () => Promise<{ success: boolean; error?: string }>
  uninstallPlugin: (id: string) => Promise<{ success: boolean; error?: string }>
  refreshPluginList: () => Promise<void>
}

function syncLoadedStatus(plugins: PluginStatus[]): PluginStatus[] {
  return plugins.map((p) => {
    const loaded = getLoadedPlugin(p.id)
    if (!loaded) return p
    return {
      ...p,
      loaded: loaded.status === 'loaded',
      error: loaded.status === 'error' ? loaded.errorMessage : p.error
    }
  })
}

export const usePluginStore = create<PluginStoreState>((set, get) => ({
  plugins: [],
  initialized: false,

  initPlugins: async () => {
    if (get().initialized) return

    try {
      const result = await window.api.plugins.scan()
      if (result.success && result.data) {
        let plugins = result.data as unknown as PluginStatus[]

        for (const plugin of plugins) {
          if (plugin.enabled && !plugin.error && plugin.manifest.type !== 'content-pack') {
            await loadPlugin(plugin.manifest)
          }
        }

        plugins = syncLoadedStatus(plugins)
        set({ plugins, initialized: true })
      } else {
        set({ initialized: true })
      }
    } catch {
      set({ initialized: true })
    }
  },

  enablePlugin: async (id: string) => {
    await window.api.plugins.enable(id)
    const plugin = get().plugins.find((p) => p.id === id)
    if (plugin && plugin.manifest.type !== 'content-pack') {
      await loadPlugin(plugin.manifest)
    }
    useDataStore.getState().clearAll()
    await get().refreshPluginList()
  },

  disablePlugin: async (id: string) => {
    await window.api.plugins.disable(id)
    unloadPlugin(id)
    useDataStore.getState().clearAll()
    await get().refreshPluginList()
  },

  installPlugin: async () => {
    try {
      const result = await window.api.plugins.install()
      if (result.success) {
        useDataStore.getState().clearAll()
        await get().refreshPluginList()
      }
      return result
    } catch {
      return { success: false, error: 'Plugin installation failed' }
    }
  },

  uninstallPlugin: async (id: string) => {
    try {
      unloadPlugin(id)
      const result = await window.api.plugins.uninstall(id)
      if (result.success) {
        useDataStore.getState().clearAll()
        await get().refreshPluginList()
      }
      return result
    } catch {
      return { success: false, error: 'Plugin uninstall failed' }
    }
  },

  refreshPluginList: async () => {
    try {
      const result = await window.api.plugins.scan()
      if (result.success && result.data) {
        const plugins = syncLoadedStatus(result.data as unknown as PluginStatus[])
        set({ plugins })
      }
    } catch {
      // scan failed silently
    }
  }
}))
