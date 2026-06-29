import { type Dispatch, type SetStateAction, useCallback, useRef, useState } from 'react'
import { SETTINGS_KEYS } from '../../../constants'

/**
 * Panel sizing for the in-game layout — the bottom bar and the right sidebar:
 * their collapsed state, persisted pixel sizes, and the drag-resize /
 * double-click-collapse handlers. Extracted from `GameLayout` (PHASE — god-file
 * decomposition) so the layout shell stops owning this self-contained concern.
 * Sizes persist to localStorage; `setBottomBarHeight` / `setSidebarWidth` stay
 * internal (only the resize handlers mutate them), while the collapse setters
 * are returned because toolbar/toggle buttons in the layout flip them directly.
 */
export interface PanelResizeState {
  sidebarCollapsed: boolean
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  bottomCollapsed: boolean
  setBottomCollapsed: Dispatch<SetStateAction<boolean>>
  bottomBarHeight: number
  sidebarWidth: number
  handleBottomResize: (delta: number) => void
  handleBottomDoubleClick: () => void
  handleSidebarResize: (delta: number) => void
  handleSidebarDoubleClick: () => void
}

export function usePanelResize(): PanelResizeState {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [bottomBarHeight, setBottomBarHeight] = useState(() => {
    try {
      return parseInt(localStorage.getItem(SETTINGS_KEYS.BOTTOM_BAR_HEIGHT) || '320', 10)
    } catch {
      return 320
    }
  })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem(SETTINGS_KEYS.SIDEBAR_WIDTH) || '280', 10)
    } catch {
      return 280
    }
  })
  const prevBottomHeight = useRef(320)
  const prevSidebarWidth = useRef(280)

  const handleBottomResize = useCallback((delta: number) => {
    setBottomBarHeight((h) => {
      const newH = Math.max(160, Math.min(window.innerHeight * 0.6, h - delta))
      localStorage.setItem(SETTINGS_KEYS.BOTTOM_BAR_HEIGHT, String(newH))
      return newH
    })
  }, [])
  const handleBottomDoubleClick = useCallback(() => {
    if (bottomCollapsed) {
      setBottomCollapsed(false)
      setBottomBarHeight(prevBottomHeight.current)
    } else {
      prevBottomHeight.current = bottomBarHeight
      setBottomCollapsed(true)
    }
  }, [bottomCollapsed, bottomBarHeight])
  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => {
      const newW = Math.max(200, Math.min(500, w + delta))
      localStorage.setItem(SETTINGS_KEYS.SIDEBAR_WIDTH, String(newW))
      return newW
    })
  }, [])
  const handleSidebarDoubleClick = useCallback(() => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false)
      setSidebarWidth(prevSidebarWidth.current)
    } else {
      prevSidebarWidth.current = sidebarWidth
      setSidebarCollapsed(true)
    }
  }, [sidebarCollapsed, sidebarWidth])

  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    bottomCollapsed,
    setBottomCollapsed,
    bottomBarHeight,
    sidebarWidth,
    handleBottomResize,
    handleBottomDoubleClick,
    handleSidebarResize,
    handleSidebarDoubleClick
  }
}
