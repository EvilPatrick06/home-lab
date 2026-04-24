import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock plugin-registry ---
const mockContextMenuItems: Array<{
  pluginId: string
  label: string
  icon?: string
  onClick: (tokenId: string) => void
  dmOnly?: boolean
}> = []

const mockBottomBarWidgets: Array<{
  pluginId: string
  id: string
  label: string
  render: () => HTMLElement | null
}> = []

vi.mock('./plugin-registry', () => ({
  getPluginUIRegistry: () => ({
    contextMenuItems: mockContextMenuItems,
    bottomBarWidgets: mockBottomBarWidgets
  })
}))

import { getPluginBottomBarWidgets, getPluginContextMenuItems } from './ui-extensions'

describe('ui-extensions', () => {
  beforeEach(() => {
    mockContextMenuItems.length = 0
    mockBottomBarWidgets.length = 0
  })

  describe('getPluginContextMenuItems', () => {
    it('returns an empty array when no items are registered', () => {
      expect(getPluginContextMenuItems()).toEqual([])
    })

    it('returns all registered context menu items', () => {
      mockContextMenuItems.push(
        { pluginId: 'p1', label: 'Attack', onClick: vi.fn() },
        { pluginId: 'p2', label: 'Inspect', onClick: vi.fn(), dmOnly: true }
      )

      const items = getPluginContextMenuItems()

      expect(items).toHaveLength(2)
      expect(items[0].label).toBe('Attack')
      expect(items[1].dmOnly).toBe(true)
    })

    it('returns items with correct shape (pluginId, label, icon, onClick, dmOnly)', () => {
      const clickFn = vi.fn()
      mockContextMenuItems.push({
        pluginId: 'p1',
        label: 'Custom',
        icon: 'sword',
        onClick: clickFn,
        dmOnly: false
      })

      const item = getPluginContextMenuItems()[0]

      expect(item.pluginId).toBe('p1')
      expect(item.label).toBe('Custom')
      expect(item.icon).toBe('sword')
      expect(item.onClick).toBe(clickFn)
      expect(item.dmOnly).toBe(false)
    })
  })

  describe('getPluginBottomBarWidgets', () => {
    it('returns an empty array when no widgets are registered', () => {
      expect(getPluginBottomBarWidgets()).toEqual([])
    })

    it('returns all registered bottom bar widgets', () => {
      mockBottomBarWidgets.push(
        { pluginId: 'p1', id: 'w1', label: 'HP Tracker', render: () => null },
        { pluginId: 'p2', id: 'w2', label: 'Timer', render: () => null }
      )

      const widgets = getPluginBottomBarWidgets()

      expect(widgets).toHaveLength(2)
      expect(widgets[0].id).toBe('w1')
      expect(widgets[1].label).toBe('Timer')
    })

    it('returns widgets with correct shape (pluginId, id, label, render)', () => {
      const renderFn = () => null
      mockBottomBarWidgets.push({
        pluginId: 'p1',
        id: 'w1',
        label: 'Widget',
        render: renderFn
      })

      const widget = getPluginBottomBarWidgets()[0]

      expect(widget.pluginId).toBe('p1')
      expect(widget.id).toBe('w1')
      expect(widget.label).toBe('Widget')
      expect(widget.render).toBe(renderFn)
    })
  })
})
