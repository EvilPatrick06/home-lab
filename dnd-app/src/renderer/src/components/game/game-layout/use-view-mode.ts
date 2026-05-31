import { useCallback, useState } from 'react'

export interface ViewAsTarget {
  roleId?: string
  playerId?: string
  label?: string
}

export interface ViewModeState {
  /** 'dm' = full DM view, 'player' = filtered. The rest of the layout reads this string. */
  viewMode: 'dm' | 'player'
  /** Optional target role/player the DM is previewing (drives the banner + label). */
  viewAs: ViewAsTarget | null
  /** Set the raw view mode and persist it; switching to 'dm' clears the as-role target. */
  setViewMode: (mode: 'dm' | 'player') => void
  /** Preview the game as a specific role/player (forces player view); null returns to self/DM view. */
  setViewAsTarget: (target: { roleId?: string; playerId?: string; label: string } | null) => void
}

/**
 * Phase 29f — view-as-role state for GameLayout. Extracted as a custom hook;
 * the internal hook call order (2× useState, then 2× useCallback) is preserved
 * exactly as it was inline so React's Rules of Hooks are unaffected.
 */
export function useViewMode(campaignId: string): ViewModeState {
  const [viewMode, setViewModeRaw] = useState<'dm' | 'player'>(() => {
    try {
      const saved = sessionStorage.getItem(`game-viewMode-${campaignId}`)
      // Migrate the old bare-string key; an object form means "as-role" → player view.
      if (saved === 'player') return 'player'
      if (saved?.startsWith('{')) {
        const parsed = JSON.parse(saved) as { mode?: string }
        return parsed.mode === 'self' ? 'dm' : 'player'
      }
      return 'dm'
    } catch {
      return 'dm'
    }
  })
  const [viewAs, setViewAs] = useState<ViewAsTarget | null>(null)
  const setViewMode = useCallback(
    (mode: 'dm' | 'player') => {
      setViewModeRaw(mode)
      if (mode === 'dm') setViewAs(null)
      try {
        sessionStorage.setItem(`game-viewMode-${campaignId}`, mode)
      } catch {
        /* ignore */
      }
    },
    [campaignId]
  )
  // Preview the game as a specific role/player: forces the filtered (player) view
  // and records the target for the banner. Passing null returns to self/DM view.
  const setViewAsTarget = useCallback(
    (target: { roleId?: string; playerId?: string; label: string } | null) => {
      if (!target) {
        setViewAs(null)
        setViewMode('dm')
        return
      }
      setViewAs(target)
      setViewModeRaw('player')
      try {
        sessionStorage.setItem(`game-viewMode-${campaignId}`, JSON.stringify({ mode: 'as-role', ...target }))
      } catch {
        /* ignore */
      }
    },
    [campaignId, setViewMode]
  )
  return { viewMode, viewAs, setViewMode, setViewAsTarget }
}
