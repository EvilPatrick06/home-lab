/**
 * Leaf module: plugin command and UI registries.
 * No dependencies on plugin-api or plugin-registry to avoid circular imports.
 */

export interface PluginCommandEntry {
  pluginId: string
  name: string
  aliases?: string[]
  description: string
  dmOnly?: boolean
  execute: (args: string, context: unknown) => unknown
}

export interface PluginContextMenuItem {
  pluginId: string
  label: string
  icon?: string
  onClick: (tokenId: string) => void
  dmOnly?: boolean
}

export interface PluginBottomBarWidget {
  pluginId: string
  id: string
  label: string
  render: () => HTMLElement | null
}

export interface PluginUIRegistry {
  contextMenuItems: PluginContextMenuItem[]
  bottomBarWidgets: PluginBottomBarWidget[]
}

const pluginCommandRegistry: PluginCommandEntry[] = []
const pluginUIRegistry: PluginUIRegistry = {
  contextMenuItems: [],
  bottomBarWidgets: []
}

export function getPluginCommandRegistry(): PluginCommandEntry[] {
  return pluginCommandRegistry
}

export function getPluginUIRegistry(): PluginUIRegistry {
  return pluginUIRegistry
}
