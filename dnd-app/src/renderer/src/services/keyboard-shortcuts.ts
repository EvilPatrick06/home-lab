// keyboard-shortcuts.ts — Global keyboard shortcut manager for the game view

import shortcutsJson from '@data/ui/keyboard-shortcuts.json'
import { type KeyCombo, useAccessibilityStore } from '../stores/use-accessibility-store'
import { load5eKeyboardShortcuts } from './data-provider'

export interface ShortcutDefinition {
  key: string // e.g., 'Space', 'Escape', 'd', '1'-'9'
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: string // identifier like 'end-turn', 'open-dice', etc.
  description: string // human-readable
  category: 'combat' | 'navigation' | 'tools' | 'general'
}

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = shortcutsJson as ShortcutDefinition[]

type ShortcutHandler = (action: string) => void

let handler: ShortcutHandler | null = null
let enabled = true
let listening = false

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable) return true
  return false
}

function normalizeKey(key: string): string {
  // Normalize common key representations
  if (key === ' ') return ' '
  return key.toLowerCase()
}

export function matchesShortcut(e: KeyboardEvent, shortcut: ShortcutDefinition): boolean {
  const wantCtrl = shortcut.ctrl ?? false
  const wantShift = shortcut.shift ?? false
  const wantAlt = shortcut.alt ?? false

  if (e.ctrlKey !== wantCtrl || e.metaKey !== wantCtrl) {
    // Allow either Ctrl or Meta (Cmd on Mac) to match ctrl requirement
    if (!(e.ctrlKey === wantCtrl || e.metaKey === wantCtrl)) return false
    // But at least one must match if wantCtrl is true
    if (wantCtrl && !e.ctrlKey && !e.metaKey) return false
    // And neither should be pressed if wantCtrl is false
    if (!wantCtrl && (e.ctrlKey || e.metaKey)) return false
  }
  if (e.shiftKey !== wantShift) return false
  if (e.altKey !== wantAlt) return false

  const pressedKey = normalizeKey(e.key)
  const shortcutKey = normalizeKey(shortcut.key)

  return pressedKey === shortcutKey
}

/** Returns the effective shortcuts list, merging defaults with custom overrides. */
export function getEffectiveShortcuts(): ShortcutDefinition[] {
  const custom = useAccessibilityStore.getState().customKeybindings
  if (!custom) return DEFAULT_SHORTCUTS

  return DEFAULT_SHORTCUTS.map((shortcut) => {
    const override = custom[shortcut.action]
    if (!override) return shortcut
    return { ...shortcut, key: override.key, ctrl: override.ctrl, shift: override.shift, alt: override.alt }
  })
}

/** Get the current binding for a specific action. */
export function getShortcutForAction(action: string): ShortcutDefinition | undefined {
  return getEffectiveShortcuts().find((s) => s.action === action)
}

/** Check if a key combo conflicts with any existing binding (excluding the given action). */
export function hasConflict(
  action: string,
  combo: KeyCombo
): { conflicting: boolean; conflictAction?: string; conflictDescription?: string } {
  const effective = getEffectiveShortcuts()
  for (const s of effective) {
    if (s.action === action) continue
    if (
      normalizeKey(s.key) === normalizeKey(combo.key) &&
      (s.ctrl ?? false) === (combo.ctrl ?? false) &&
      (s.shift ?? false) === (combo.shift ?? false) &&
      (s.alt ?? false) === (combo.alt ?? false)
    ) {
      return { conflicting: true, conflictAction: s.action, conflictDescription: s.description }
    }
  }
  return { conflicting: false }
}

function handleKeyDown(e: KeyboardEvent): void {
  if (!enabled || !handler) return
  if (isEditableTarget(e.target)) return

  const shortcuts = getEffectiveShortcuts()
  for (const shortcut of shortcuts) {
    if (matchesShortcut(e, shortcut)) {
      e.preventDefault()
      e.stopPropagation()
      handler(shortcut.action)
      return
    }
  }
}

/**
 * Register a handler that receives action strings when shortcuts are pressed.
 * Returns a cleanup function to unregister.
 */
export function registerHandler(h: ShortcutHandler): () => void {
  handler = h
  return () => {
    if (handler === h) {
      handler = null
    }
  }
}

/** Start listening for keyboard events on window. */
export function init(): void {
  if (listening) return
  window.addEventListener('keydown', handleKeyDown, true)
  listening = true
}

/** Stop listening for keyboard events. */
export function destroy(): void {
  if (!listening) return
  window.removeEventListener('keydown', handleKeyDown, true)
  listening = false
  handler = null
}

/** Enable or disable shortcut processing (e.g., disable when typing in input). */
export function setEnabled(e: boolean): void {
  enabled = e
}

/** Get all shortcut definitions (with custom overrides applied). */
export function getShortcuts(): ShortcutDefinition[] {
  return getEffectiveShortcuts()
}

/** Load shortcut definitions from the data store (includes plugin additions). */
export async function loadShortcutDefinitions(): Promise<ShortcutDefinition[]> {
  const data = await load5eKeyboardShortcuts()
  return data as unknown as ShortcutDefinition[]
}

/** Get shortcut definitions grouped by category (with custom overrides applied). */
export function getShortcutsByCategory(): Record<string, ShortcutDefinition[]> {
  const grouped: Record<string, ShortcutDefinition[]> = {}
  for (const shortcut of getEffectiveShortcuts()) {
    if (!grouped[shortcut.category]) {
      grouped[shortcut.category] = []
    }
    grouped[shortcut.category].push(shortcut)
  }
  return grouped
}

/** Format a shortcut's key combo for display (e.g., "Ctrl+Z"). */
export function formatKeyCombo(shortcut: ShortcutDefinition): string {
  const parts: string[] = []
  if (shortcut.ctrl) parts.push('Ctrl')
  if (shortcut.alt) parts.push('Alt')
  if (shortcut.shift) parts.push('Shift')

  // Friendly key names for display
  let keyDisplay = shortcut.key
  if (keyDisplay === ' ') keyDisplay = 'Space'
  else if (keyDisplay === 'Escape') keyDisplay = 'Esc'
  else if (keyDisplay.length === 1) keyDisplay = keyDisplay.toUpperCase()

  parts.push(keyDisplay)
  return parts.join('+')
}
