// ============================================================================
// Plugin System Initialization
// Called from main.tsx after React renders.
// ============================================================================

import { usePluginStore } from '../../stores/use-plugin-store'
import { logger } from '../../utils/logger'

let initialized = false

/**
 * Initialize the plugin system.
 * Scans for installed plugins, loads enabled code plugins, and sets up the event bus.
 */
export async function initPluginSystem(): Promise<void> {
  if (initialized) return
  initialized = true

  try {
    await usePluginStore.getState().initPlugins()
    logger.debug('[PluginSystem] Plugin system initialized')
  } catch (err) {
    logger.error('[PluginSystem] Failed to initialize plugin system:', err)
  }
}
