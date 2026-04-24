import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the JSON import
vi.mock('../../public/data/ui/keyboard-shortcuts.json', () => ({
  default: [
    { key: ' ', action: 'end-turn', description: 'End Turn', category: 'combat' },
    { key: 'Escape', action: 'close-modal', description: 'Close Modal', category: 'general' },
    { key: 'd', action: 'open-dice', description: 'Open Dice', category: 'tools' },
    { key: 'z', ctrl: true, action: 'undo', description: 'Undo', category: 'general' },
    { key: 'y', ctrl: true, action: 'redo', description: 'Redo', category: 'general' },
    { key: '1', action: 'hotbar-1', description: 'Hotbar slot 1', category: 'navigation' }
  ]
}))

// Mock accessibility store
vi.mock('../stores/use-accessibility-store', () => ({
  useAccessibilityStore: {
    getState: () => ({
      customKeybindings: null
    })
  }
}))

// Stub window for event listener tests
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  focus: vi.fn()
})

import {
  destroy,
  formatKeyCombo,
  getShortcutForAction,
  getShortcuts,
  getShortcutsByCategory,
  hasConflict,
  init,
  matchesShortcut,
  registerHandler,
  type ShortcutDefinition,
  setEnabled
} from './keyboard-shortcuts'

function makeKeyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: null,
    ...overrides
  } as unknown as KeyboardEvent
}

describe('keyboard-shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    destroy()
  })

  describe('matchesShortcut', () => {
    it('matches a simple key press', () => {
      const shortcut: ShortcutDefinition = {
        key: 'd',
        action: 'open-dice',
        description: 'Open Dice',
        category: 'tools'
      }
      const event = makeKeyEvent({ key: 'd' })
      expect(matchesShortcut(event, shortcut)).toBe(true)
    })

    it('does not match when wrong key is pressed', () => {
      const shortcut: ShortcutDefinition = {
        key: 'd',
        action: 'open-dice',
        description: 'Open Dice',
        category: 'tools'
      }
      const event = makeKeyEvent({ key: 'x' })
      expect(matchesShortcut(event, shortcut)).toBe(false)
    })

    it('matches Ctrl+key combo', () => {
      const shortcut: ShortcutDefinition = {
        key: 'z',
        ctrl: true,
        action: 'undo',
        description: 'Undo',
        category: 'general'
      }
      const event = makeKeyEvent({ key: 'z', ctrlKey: true })
      expect(matchesShortcut(event, shortcut)).toBe(true)
    })

    it('does not match Ctrl+key when Ctrl is not pressed', () => {
      const shortcut: ShortcutDefinition = {
        key: 'z',
        ctrl: true,
        action: 'undo',
        description: 'Undo',
        category: 'general'
      }
      const event = makeKeyEvent({ key: 'z', ctrlKey: false })
      expect(matchesShortcut(event, shortcut)).toBe(false)
    })

    it('does not match when Ctrl is pressed but shortcut does not require it', () => {
      const shortcut: ShortcutDefinition = {
        key: 'd',
        action: 'open-dice',
        description: 'Open Dice',
        category: 'tools'
      }
      const event = makeKeyEvent({ key: 'd', ctrlKey: true })
      expect(matchesShortcut(event, shortcut)).toBe(false)
    })

    it('requires shift when shortcut specifies shift', () => {
      const shortcut: ShortcutDefinition = {
        key: 'z',
        ctrl: true,
        shift: true,
        action: 'redo-alt',
        description: 'Redo',
        category: 'general'
      }
      const event = makeKeyEvent({ key: 'z', ctrlKey: true, shiftKey: true })
      expect(matchesShortcut(event, shortcut)).toBe(true)
    })

    it('requires alt when shortcut specifies alt', () => {
      const shortcut: ShortcutDefinition = {
        key: 't',
        alt: true,
        action: 'alt-t',
        description: 'Alt+T',
        category: 'general'
      }
      const event = makeKeyEvent({ key: 't', altKey: true })
      expect(matchesShortcut(event, shortcut)).toBe(true)
    })

    it('normalizes key to lowercase', () => {
      const shortcut: ShortcutDefinition = {
        key: 'd',
        action: 'open-dice',
        description: 'Open Dice',
        category: 'tools'
      }
      const event = makeKeyEvent({ key: 'D' })
      expect(matchesShortcut(event, shortcut)).toBe(true)
    })
  })

  describe('getShortcuts / getShortcutsByCategory', () => {
    it('returns all default shortcuts', () => {
      const shortcuts = getShortcuts()
      expect(shortcuts.length).toBeGreaterThanOrEqual(1)
    })

    it('groups shortcuts by category', () => {
      const grouped = getShortcutsByCategory()
      expect(grouped).toHaveProperty('combat')
      expect(grouped).toHaveProperty('general')
    })
  })

  describe('getShortcutForAction', () => {
    it('finds a shortcut by action name', () => {
      const shortcut = getShortcutForAction('end-turn')
      expect(shortcut).toBeDefined()
      expect(shortcut!.key).toBe(' ')
    })

    it('returns undefined for unknown action', () => {
      expect(getShortcutForAction('nonexistent-action')).toBeUndefined()
    })
  })

  describe('hasConflict', () => {
    it('detects no conflict when key combo is unique', () => {
      const result = hasConflict('my-action', { key: 'q' })
      expect(result.conflicting).toBe(false)
    })

    it('detects conflict when key combo matches another action', () => {
      // Space is bound to 'end-turn' in our mock data
      const result = hasConflict('my-new-action', { key: ' ' })
      expect(result.conflicting).toBe(true)
      expect(result.conflictAction).toBe('end-turn')
    })

    it('does not conflict with the same action', () => {
      const result = hasConflict('end-turn', { key: ' ' })
      expect(result.conflicting).toBe(false)
    })
  })

  describe('formatKeyCombo', () => {
    it('formats simple key', () => {
      const result = formatKeyCombo({
        key: 'd',
        action: 'test',
        description: 'Test',
        category: 'general'
      })
      expect(result).toBe('D')
    })

    it('formats Ctrl+key', () => {
      const result = formatKeyCombo({
        key: 'z',
        ctrl: true,
        action: 'undo',
        description: 'Undo',
        category: 'general'
      })
      expect(result).toBe('Ctrl+Z')
    })

    it('formats space key', () => {
      const result = formatKeyCombo({
        key: ' ',
        action: 'end-turn',
        description: 'End Turn',
        category: 'combat'
      })
      expect(result).toBe('Space')
    })

    it('formats Escape key', () => {
      const result = formatKeyCombo({
        key: 'Escape',
        action: 'close',
        description: 'Close',
        category: 'general'
      })
      expect(result).toBe('Esc')
    })

    it('formats Ctrl+Shift+Alt combo', () => {
      const result = formatKeyCombo({
        key: 'a',
        ctrl: true,
        shift: true,
        alt: true,
        action: 'test',
        description: 'Test',
        category: 'general'
      })
      expect(result).toBe('Ctrl+Alt+Shift+A')
    })
  })

  describe('registerHandler', () => {
    it('returns a cleanup function', () => {
      const handler = vi.fn()
      const cleanup = registerHandler(handler)
      expect(typeof cleanup).toBe('function')
      cleanup()
    })
  })

  describe('init / destroy', () => {
    it('registers keydown event listener on init', () => {
      init()
      expect(window.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    })

    it('is idempotent (second init does not double-register)', () => {
      init()
      init()
      expect(window.addEventListener).toHaveBeenCalledTimes(1)
    })

    it('removes keydown event listener on destroy', () => {
      init()
      destroy()
      expect(window.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    })

    it('destroy is idempotent', () => {
      destroy()
      expect(window.removeEventListener).not.toHaveBeenCalled()
    })
  })

  describe('setEnabled', () => {
    it('can enable and disable shortcut processing', () => {
      setEnabled(false)
      setEnabled(true)
      // No errors thrown — functional test covered by integration
    })
  })
})
