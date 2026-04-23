import { useEffect, useRef } from 'react'
import { destroy, init, registerHandler } from '../services/keyboard-shortcuts'
import { useGameStore } from '../stores/use-game-store'

export interface GameShortcutCallbacks {
  onEndTurn?: () => void
  onToggleInitiative?: () => void
  onToggleJournal?: () => void
  onOpenDice?: () => void
  onCloseModal?: () => void
  onShowShortcuts?: () => void
  onToggleMapEditor?: () => void
}

/**
 * Wires the keyboard-shortcuts service to actual game store actions.
 * Mount once inside the game layout so shortcuts are only active during play.
 */
export function useGameShortcuts(isDM: boolean, callbacks: GameShortcutCallbacks = {}): void {
  const cbRef = useRef(callbacks)
  cbRef.current = callbacks

  useEffect(() => {
    init()

    const unregister = registerHandler((action) => {
      const state = useGameStore.getState()
      const cb = cbRef.current

      switch (action) {
        case 'end-turn':
          if (state.initiative) cb.onEndTurn?.()
          break

        case 'cycle-tokens': {
          if (!state.initiative) break
          const entries = state.initiative.entries
          if (entries.length === 0) break
          const activeIdx = entries.findIndex((e) => e.isActive)
          const nextIdx = (activeIdx + 1) % entries.length
          const nextEntry = entries[nextIdx]
          if (nextEntry) state.requestCenterOnEntity(nextEntry.id)
          break
        }

        case 'toggle-initiative':
          cb.onToggleInitiative?.()
          break

        case 'focus-chat': {
          const chatInput = document.querySelector<HTMLInputElement>('[data-chat-input]')
          chatInput?.focus()
          break
        }

        case 'toggle-journal':
          cb.onToggleJournal?.()
          break

        case 'open-dice':
          cb.onOpenDice?.()
          break

        case 'close-modal':
          cb.onCloseModal?.()
          break

        case 'show-shortcuts':
          cb.onShowShortcuts?.()
          break

        case 'toggle-map-editor':
          if (isDM) cb.onToggleMapEditor?.()
          break

        case 'undo':
          // Reserved for future undo system
          break

        case 'redo':
          // Reserved for future redo system
          break

        // zoom-in, zoom-out, zoom-fit are handled natively by the map canvas
        // quick-action-1..10 are handled by the Hotbar component directly

        default:
          break
      }
    })

    return () => {
      unregister()
      destroy()
    }
  }, [isDM])
}
