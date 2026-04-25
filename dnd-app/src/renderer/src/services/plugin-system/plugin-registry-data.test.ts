import { describe, expect, it } from 'vitest'
import { getPluginCommandRegistry, getPluginUIRegistry } from './plugin-registry-data'

describe('plugin-registry-data', () => {
  it('exposes registries as mutable arrays (commands may be pushed later)', () => {
    const cmds = getPluginCommandRegistry()
    const ui = getPluginUIRegistry()
    expect(Array.isArray(cmds)).toBe(true)
    expect(ui.contextMenuItems).toEqual([])
    expect(ui.bottomBarWidgets).toEqual([])
  })
})
