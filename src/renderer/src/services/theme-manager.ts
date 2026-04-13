import { SETTINGS_KEYS } from '../constants'
/**
 * Theme manager for the application.
 * Overrides Tailwind v4 CSS custom properties (--color-gray-*, --color-amber-*)
 * on :root to dynamically switch themes at runtime.
 */

import themesJson from '@data/ui/themes.json'
import { load5eThemes, type ThemesFile } from './data-provider'

type _ThemesFile = ThemesFile

export type ThemeName = 'dark' | 'parchment' | 'high-contrast' | 'royal-purple'

const STORAGE_KEY = SETTINGS_KEYS.THEME

const THEME_DEFINITIONS = themesJson as Record<ThemeName, Record<string, string>>

// Track which CSS properties were set so we can remove them when switching to dark
let appliedProps: string[] = []

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let currentTheme: ThemeName = 'dark'

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/** Returns the currently active theme name. */
export function getTheme(): ThemeName {
  return currentTheme
}

/** Returns the ordered list of all available theme names. */
export function getThemeNames(): ThemeName[] {
  return Object.keys(THEME_DEFINITIONS) as ThemeName[]
}

/** Load theme definitions from the data store (includes plugin overrides). */
export async function loadThemeDefinitions(): Promise<Record<string, Record<string, string>>> {
  return load5eThemes()
}

/**
 * Applies the given theme by overriding Tailwind CSS custom properties on :root
 * and persists the choice to localStorage.
 *
 * For the 'dark' theme, all overrides are removed so Tailwind defaults apply.
 */
export function setTheme(theme: ThemeName): void {
  const vars = THEME_DEFINITIONS[theme]
  if (vars === undefined) return

  currentTheme = theme
  const style = document.documentElement.style

  // Remove previously applied overrides
  for (const prop of appliedProps) {
    style.removeProperty(prop)
  }
  appliedProps = []

  // Apply new overrides (dark theme has empty object — uses Tailwind defaults)
  for (const [prop, value] of Object.entries(vars)) {
    style.setProperty(prop, value)
    appliedProps.push(prop)
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // localStorage may be unavailable; silently ignore
  }
}

/**
 * Reads the saved theme from localStorage and applies it.
 * Falls back to 'dark' if nothing is saved or the value is invalid.
 * Call this once on app start.
 */
export function loadSavedTheme(): void {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage may be unavailable
  }

  const names = getThemeNames()
  const theme: ThemeName = saved && names.includes(saved as ThemeName) ? (saved as ThemeName) : 'dark'
  setTheme(theme)
}

/**
 * Applies a CSS filter on :root for colorblind simulation.
 * Requires corresponding SVG <filter> elements to be rendered (see ColorblindFilters.tsx).
 */
export function applyColorblindFilter(mode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'): void {
  const style = document.documentElement.style
  if (mode === 'none') {
    style.removeProperty('filter')
  } else {
    style.setProperty('filter', `url(#${mode}-filter)`)
  }
}
