import { useCallback, useRef, useState } from 'react'

interface PanelResizeResult {
  bottomBarHeight: number
  bottomCollapsed: boolean
  setBottomCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  sidebarWidth: number
  sidebarCollapsed: boolean
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>
  handleBottomResize: (delta: number) => void
  handleBottomDoubleClick: () => void
  handleSidebarResize: (delta: number) => void
  handleSidebarDoubleClick: () => void
}

const DEFAULT_BOTTOM_BAR_HEIGHT = 260
const DEFAULT_SIDEBAR_WIDTH = 320

export function usePanelResize(): PanelResizeResult {
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [bottomBarHeight, setBottomBarHeight] = useState(DEFAULT_BOTTOM_BAR_HEIGHT)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)

  const prevBottomHeight = useRef(bottomBarHeight)
  const prevSidebarWidth = useRef(sidebarWidth)

  const handleBottomResize = useCallback(
    (delta: number) => {
      setBottomBarHeight(Math.max(160, Math.min(window.innerHeight * 0.6, bottomBarHeight - delta)))
    },
    [bottomBarHeight]
  )

  const handleBottomDoubleClick = useCallback(() => {
    if (bottomCollapsed) {
      setBottomCollapsed(false)
      setBottomBarHeight(prevBottomHeight.current)
    } else {
      prevBottomHeight.current = bottomBarHeight
      setBottomCollapsed(true)
    }
  }, [bottomCollapsed, bottomBarHeight])

  const handleSidebarResize = useCallback(
    (delta: number) => {
      setSidebarWidth(Math.max(200, Math.min(500, sidebarWidth + delta)))
    },
    [sidebarWidth]
  )

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
    bottomBarHeight,
    bottomCollapsed,
    setBottomCollapsed,
    sidebarWidth,
    sidebarCollapsed,
    setSidebarCollapsed,
    handleBottomResize,
    handleBottomDoubleClick,
    handleSidebarResize,
    handleSidebarDoubleClick
  }
}
