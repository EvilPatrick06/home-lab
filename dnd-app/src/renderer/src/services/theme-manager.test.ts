import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock themes JSON — dark is empty (uses Tailwind defaults), others override --color-* vars
vi.mock('../../public/data/ui/themes.json', () => ({
  default: {
    dark: {},
    parchment: {
      '--color-gray-950': '#f5f0e1',
      '--color-gray-900': '#e8e0cc',
      '--color-gray-800': '#dbd1b8',
      '--color-gray-100': '#2c1810',
      '--color-amber-500': '#b8860b'
    },
    'high-contrast': {
      '--color-gray-950': '#000000',
      '--color-gray-900': '#0a0a0a',
      '--color-gray-800': '#1a1a1a',
      '--color-gray-100': '#ffffff',
      '--color-amber-500': '#ffff00'
    },
    'royal-purple': {
      '--color-gray-950': '#1a0a2e',
      '--color-gray-900': '#241340',
      '--color-gray-800': '#2e1c52',
      '--color-gray-100': '#d0c8e0',
      '--color-amber-500': '#9b59b6'
    }
  }
}))

// Mock document.documentElement.style
const mockStyle = {
  setProperty: vi.fn(),
  removeProperty: vi.fn()
}

vi.stubGlobal('document', {
  documentElement: { style: mockStyle }
})

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn(),
  clear: vi.fn()
}

vi.stubGlobal('localStorage', localStorageMock)

describe('theme-manager', () => {
  let themeManager: typeof import('./theme-manager')

  beforeEach(async () => {
    vi.clearAllMocks()
    localStorageMock.store = {}
    vi.resetModules()
    themeManager = await import('./theme-manager')
  })

  describe('getTheme', () => {
    it('returns the default theme (dark)', () => {
      expect(themeManager.getTheme()).toBe('dark')
    })
  })

  describe('getThemeNames', () => {
    it('returns all available theme names', () => {
      const names = themeManager.getThemeNames()
      expect(names).toContain('dark')
      expect(names).toContain('parchment')
      expect(names).toContain('high-contrast')
      expect(names).toContain('royal-purple')
      expect(names).toHaveLength(4)
    })
  })

  describe('setTheme', () => {
    it('applies no CSS overrides for dark theme (uses Tailwind defaults)', () => {
      themeManager.setTheme('dark')
      expect(mockStyle.setProperty).not.toHaveBeenCalled()
    })

    it('overrides Tailwind color variables for non-dark themes', () => {
      themeManager.setTheme('parchment')
      expect(mockStyle.setProperty).toHaveBeenCalledWith('--color-gray-950', '#f5f0e1')
      expect(mockStyle.setProperty).toHaveBeenCalledWith('--color-amber-500', '#b8860b')
    })

    it('updates the current theme', () => {
      themeManager.setTheme('parchment')
      expect(themeManager.getTheme()).toBe('parchment')
    })

    it('persists choice to localStorage', () => {
      themeManager.setTheme('high-contrast')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('dnd-vtt-theme', 'high-contrast')
    })

    it('does nothing for unknown theme name', () => {
      themeManager.setTheme('nonexistent' as never)
      expect(mockStyle.setProperty).not.toHaveBeenCalled()
    })

    it('removes previous overrides when switching themes', () => {
      themeManager.setTheme('parchment')
      mockStyle.setProperty.mockClear()
      mockStyle.removeProperty.mockClear()

      themeManager.setTheme('dark')
      // Should remove the 5 parchment overrides
      expect(mockStyle.removeProperty).toHaveBeenCalledWith('--color-gray-950')
      expect(mockStyle.removeProperty).toHaveBeenCalledWith('--color-amber-500')
    })

    it('applies all CSS variables for royal-purple', () => {
      themeManager.setTheme('royal-purple')
      expect(mockStyle.setProperty).toHaveBeenCalledTimes(5)
    })
  })

  describe('loadSavedTheme', () => {
    it('loads theme from localStorage', () => {
      localStorageMock.store['dnd-vtt-theme'] = 'parchment'
      themeManager.loadSavedTheme()
      expect(themeManager.getTheme()).toBe('parchment')
    })

    it('falls back to dark when no saved theme', () => {
      themeManager.loadSavedTheme()
      expect(themeManager.getTheme()).toBe('dark')
    })

    it('falls back to dark for invalid saved theme', () => {
      localStorageMock.store['dnd-vtt-theme'] = 'nonexistent-theme'
      themeManager.loadSavedTheme()
      expect(themeManager.getTheme()).toBe('dark')
    })
  })

  describe('applyColorblindFilter', () => {
    it('removes filter for none mode', () => {
      themeManager.applyColorblindFilter('none')
      expect(mockStyle.removeProperty).toHaveBeenCalledWith('filter')
    })

    it('sets filter for deuteranopia', () => {
      themeManager.applyColorblindFilter('deuteranopia')
      expect(mockStyle.setProperty).toHaveBeenCalledWith('filter', 'url(#deuteranopia-filter)')
    })

    it('sets filter for protanopia', () => {
      themeManager.applyColorblindFilter('protanopia')
      expect(mockStyle.setProperty).toHaveBeenCalledWith('filter', 'url(#protanopia-filter)')
    })

    it('sets filter for tritanopia', () => {
      themeManager.applyColorblindFilter('tritanopia')
      expect(mockStyle.setProperty).toHaveBeenCalledWith('filter', 'url(#tritanopia-filter)')
    })
  })
})
