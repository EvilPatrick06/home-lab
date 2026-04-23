// ============================================================================
// Plugin Registry
// Manages the lifecycle of loaded plugins: load, unload, track status.
// ============================================================================

import type { PluginManifest } from '../../../../shared/plugin-types'
import { useGameStore } from '../../stores/use-game-store'
import { registerSystem, unregisterSystem } from '../../systems/registry'
import type { GameSystemPlugin } from '../../systems/types'
import { logger } from '../../utils/logger'
import {
  type DmAction,
  type ExecutionFailure,
  type ExecutionResult,
  type GameStoreSnapshot,
  registerPluginDmAction,
  unregisterPluginDmAction
} from '../game-action-executor'

type _DmAction = DmAction
type _ExecutionFailure = ExecutionFailure
type _ExecutionResult = ExecutionResult
type _GameStoreSnapshot = GameStoreSnapshot

import { pluginEventBus } from './event-bus'
import { createPluginAPI, type PluginAPI } from './plugin-api'
import { getPluginCommandRegistry, getPluginUIRegistry } from './plugin-registry-data'

export interface LoadedPlugin {
  id: string
  manifest: PluginManifest
  status: 'loaded' | 'error' | 'unloaded'
  instance?: {
    activate: (api: PluginAPI) => void
    deactivate?: () => void
  }
  api?: PluginAPI
  errorMessage?: string
  registeredGameSystem?: boolean
}

// --- Loaded plugins map; registry data lives in plugin-registry-data.ts ---

const loadedPlugins = new Map<string, LoadedPlugin>()

export { getPluginCommandRegistry, getPluginUIRegistry } from './plugin-registry-data'

export function getLoadedPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values())
}

export function getLoadedPlugin(id: string): LoadedPlugin | undefined {
  return loadedPlugins.get(id)
}

/**
 * Load a code plugin by importing its entry point via the plugin:// protocol.
 */
export async function loadPlugin(manifest: PluginManifest): Promise<LoadedPlugin> {
  const id = manifest.id

  // Only code plugins and game system plugins have entry points
  if (manifest.type === 'content-pack') {
    const loaded: LoadedPlugin = { id, manifest, status: 'loaded' }
    loadedPlugins.set(id, loaded)
    return loaded
  }

  if (!('entry' in manifest) || !manifest.entry) {
    const loaded: LoadedPlugin = { id, manifest, status: 'error', errorMessage: 'No entry point' }
    loadedPlugins.set(id, loaded)
    return loaded
  }

  try {
    const moduleUrl = `plugin://${id}/${manifest.entry}`
    const module = await import(/* @vite-ignore */ moduleUrl)

    if (typeof module.activate !== 'function') {
      throw new Error('Plugin module must export an activate() function')
    }

    const api = createPluginAPI(id, manifest, {
      getGameState: () => useGameStore.getState()
    })
    module.activate(api)

    if (typeof module.handleDmAction === 'function') {
      registerPluginDmAction(`plugin:${id}:action`, module.handleDmAction)
    }

    let registeredGameSystem = false

    // Game-system plugins can export a gameSystemPlugin conforming to GameSystemPlugin
    if (manifest.type === 'game-system' && module.gameSystemPlugin) {
      try {
        const gsp = module.gameSystemPlugin as GameSystemPlugin
        if (typeof gsp.id === 'string' && typeof gsp.name === 'string') {
          registerSystem(gsp)
          registeredGameSystem = true
          logger.info(`[PluginRegistry] Registered game system "${gsp.id}" from plugin "${id}"`)
        } else {
          logger.warn(`[PluginRegistry] Plugin "${id}" exports gameSystemPlugin without id/name`)
        }
      } catch (gsErr) {
        logger.error(`[PluginRegistry] Failed to register game system from plugin "${id}":`, gsErr)
      }
    }

    const loaded: LoadedPlugin = {
      id,
      manifest,
      status: 'loaded',
      instance: {
        activate: module.activate,
        deactivate: typeof module.deactivate === 'function' ? module.deactivate : undefined
      },
      api,
      registeredGameSystem
    }
    loadedPlugins.set(id, loaded)
    return loaded
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error(`[PluginRegistry] Failed to load plugin "${id}":`, errorMessage)
    const loaded: LoadedPlugin = { id, manifest, status: 'error', errorMessage }
    loadedPlugins.set(id, loaded)
    return loaded
  }
}

/**
 * Unload a plugin: call deactivate(), remove event subscriptions, clean up registries.
 */
export function unloadPlugin(id: string): void {
  const loaded = loadedPlugins.get(id)
  if (!loaded) return

  // Call deactivate if available
  try {
    loaded.instance?.deactivate?.()
  } catch (err) {
    logger.error(`[PluginRegistry] Error deactivating plugin "${id}":`, err)
  }

  // Remove all event subscriptions
  pluginEventBus.removePlugin(id)

  // Remove any registered plugin DM actions (prefixed with 'plugin:<id>:')
  unregisterPluginDmAction(`plugin:${id}:action`)

  // Remove registered commands
  const cmdRegistry = getPluginCommandRegistry()
  for (let i = cmdRegistry.length - 1; i >= 0; i--) {
    if (cmdRegistry[i].pluginId === id) {
      cmdRegistry.splice(i, 1)
    }
  }

  // Remove UI contributions
  const uiRegistry = getPluginUIRegistry()
  uiRegistry.contextMenuItems = uiRegistry.contextMenuItems.filter((item) => item.pluginId !== id)
  uiRegistry.bottomBarWidgets = uiRegistry.bottomBarWidgets.filter((w) => w.pluginId !== id)

  // Unregister game system if this plugin registered one
  if (loaded.registeredGameSystem) {
    try {
      unregisterSystem(id)
    } catch (err) {
      logger.error(`[PluginRegistry] Error unregistering game system for plugin "${id}":`, err)
    }
  }

  loaded.status = 'unloaded'
  loadedPlugins.delete(id)
}

/**
 * Unload all plugins.
 */
export function unloadAllPlugins(): void {
  for (const id of Array.from(loadedPlugins.keys())) {
    unloadPlugin(id)
  }
}
