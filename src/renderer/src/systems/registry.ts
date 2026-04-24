import { registerGameSystem, unregisterGameSystem } from '../types/game-system'
import type { GameSystemPlugin } from './types'

const registry = new Map<string, GameSystemPlugin>()

export function registerSystem(plugin: GameSystemPlugin): void {
  registry.set(plugin.id, plugin)
  // If the plugin provides a config, also register it in GAME_SYSTEMS
  if (plugin.getConfig) {
    registerGameSystem(plugin.getConfig())
  }
}

export function unregisterSystem(id: string): void {
  if (id === 'dnd5e') return // Cannot remove built-in system
  registry.delete(id)
  unregisterGameSystem(id)
}

export function getSystem(id: string): GameSystemPlugin {
  const plugin = registry.get(id)
  if (!plugin) throw new Error(`Game system '${id}' not registered`)
  return plugin
}

export function getAllSystems(): GameSystemPlugin[] {
  return Array.from(registry.values())
}
