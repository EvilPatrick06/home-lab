// ============================================================================
// UI Extension Helpers
// Provides React-friendly access to plugin UI contributions.
// ============================================================================

import { getPluginUIRegistry } from './plugin-registry'

export interface PluginContextMenuAction {
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

export function getPluginContextMenuItems(): PluginContextMenuAction[] {
  return getPluginUIRegistry().contextMenuItems
}

export function getPluginBottomBarWidgets(): PluginBottomBarWidget[] {
  return getPluginUIRegistry().bottomBarWidgets
}
