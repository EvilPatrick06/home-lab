import { type Dispatch, type SetStateAction, useState } from 'react'

/**
 * Window fullscreen state for the in-game layout: tracks whether the app is
 * fullscreen and toggles it through the main process. Extracted from
 * `GameLayout` (god-file decomposition). `setIsFullscreen` is returned because
 * `useGameEffects` also flips it in response to main-process fullscreen events.
 */
export interface FullscreenState {
  isFullscreen: boolean
  setIsFullscreen: Dispatch<SetStateAction<boolean>>
  handleToggleFullscreen: () => void
}

export function useFullscreen(): FullscreenState {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const handleToggleFullscreen = (): void => {
    window.api.toggleFullscreen().then((fs) => setIsFullscreen(fs))
  }
  return { isFullscreen, setIsFullscreen, handleToggleFullscreen }
}
