import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import {
  DEFAULT_SHORTCUTS,
  formatKeyCombo,
  getShortcutsByCategory,
  hasConflict,
  type ShortcutDefinition
} from '../../services/keyboard-shortcuts'
import { type KeyCombo, useAccessibilityStore } from '../../stores/use-accessibility-store'

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  combat: 'pages.settingsPage.categoryCombat',
  navigation: 'pages.settingsPage.categoryNavigation',
  tools: 'pages.settingsPage.categoryTools',
  general: 'pages.settingsPage.categoryGeneral'
}

export function KeybindingEditor(): JSX.Element {
  const { t } = useT()
  const grouped = getShortcutsByCategory()
  const customKeybindings = useAccessibilityStore((s) => s.customKeybindings)
  const setCustomKeybinding = useAccessibilityStore((s) => s.setCustomKeybinding)
  const resetKeybinding = useAccessibilityStore((s) => s.resetKeybinding)
  const resetAllKeybindings = useAccessibilityStore((s) => s.resetAllKeybindings)

  const [capturing, setCapturing] = useState<string | null>(null) // action being rebound
  const [conflict, setConflict] = useState<{ action: string; description: string } | null>(null)
  const [pendingCombo, setPendingCombo] = useState<KeyCombo | null>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!capturing) return

    const handleKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      // Ignore bare modifier presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const combo: KeyCombo = {
        key: e.key,
        ...(e.ctrlKey || e.metaKey ? { ctrl: true } : {}),
        ...(e.shiftKey ? { shift: true } : {}),
        ...(e.altKey ? { alt: true } : {})
      }

      const result = hasConflict(capturing, combo)
      if (result.conflicting) {
        setConflict({ action: result.conflictAction!, description: result.conflictDescription! })
        setPendingCombo(combo)
        return
      }

      setCustomKeybinding(capturing, combo)
      setCapturing(null)
      setConflict(null)
      setPendingCombo(null)
    }

    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [capturing, setCustomKeybinding])

  const handleSwap = (): void => {
    if (!pendingCombo || !capturing || !conflict) return
    // Find the current binding of the conflicting action and assign it to the one being rebound
    const currentBinding = getDefaultForAction(capturing)
    if (currentBinding) {
      setCustomKeybinding(conflict.action, {
        key: currentBinding.key,
        ...(currentBinding.ctrl ? { ctrl: true } : {}),
        ...(currentBinding.shift ? { shift: true } : {}),
        ...(currentBinding.alt ? { alt: true } : {})
      })
    }
    setCustomKeybinding(capturing, pendingCombo)
    setCapturing(null)
    setConflict(null)
    setPendingCombo(null)
  }

  const getDefaultForAction = (action: string): ShortcutDefinition | undefined => {
    return DEFAULT_SHORTCUTS.find((s) => s.action === action)
  }

  const isCustom = (action: string): boolean => {
    return customKeybindings != null && action in customKeybindings
  }

  return (
    <div ref={captureRef}>
      {Object.entries(grouped).map(([category, shortcuts]) => (
        <div key={category} className="mb-4 last:mb-0">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {CATEGORY_LABEL_KEYS[category] ? t(CATEGORY_LABEL_KEYS[category]) : category}
          </div>
          <div className="space-y-1">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.action}
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface-2/50"
              >
                <span className="text-sm text-gray-300">{shortcut.description}</span>
                <div className="flex items-center gap-2">
                  <kbd
                    className={`px-2 py-1 text-xs border rounded font-mono min-w-[60px] text-center ${
                      isCustom(shortcut.action)
                        ? 'bg-amber-900/30 border-amber-700/50 text-amber-300'
                        : 'bg-surface border-border text-gray-300'
                    }`}
                  >
                    {formatKeyCombo(shortcut)}
                  </kbd>
                  {capturing === shortcut.action ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-accent animate-pulse">{t('pages.settingsPage.pressAKey')}</span>
                      <button
                        onClick={() => {
                          setCapturing(null)
                          setConflict(null)
                          setPendingCombo(null)
                        }}
                        className="px-2 py-0.5 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-gray-200 cursor-pointer"
                      >
                        {t('common.actions.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCapturing(shortcut.action)}
                      className="px-2 py-0.5 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-gray-200 hover:border-amber-600 cursor-pointer"
                    >
                      {t('pages.settingsPage.rebind')}
                    </button>
                  )}
                  {isCustom(shortcut.action) && (
                    <button
                      onClick={() => resetKeybinding(shortcut.action)}
                      className="px-2 py-0.5 text-xs bg-surface border border-gray-600 rounded text-fg hover:text-red-300 cursor-pointer"
                    >
                      {t('pages.settingsPage.reset')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Conflict modal */}
      {conflict && pendingCombo && (
        <div className="mt-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
          <p className="text-xs text-red-300 mb-2">
            {t('pages.settingsPage.keyConflict', { description: conflict.description })}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSwap}
              className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong text-white rounded cursor-pointer"
            >
              {t('pages.settingsPage.swapBindings')}
            </button>
            <button
              onClick={() => {
                setConflict(null)
                setPendingCombo(null)
                setCapturing(null)
              }}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
            >
              {t('common.actions.cancel')}
            </button>
          </div>
        </div>
      )}

      {customKeybindings && Object.keys(customKeybindings).length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <button
            onClick={resetAllKeybindings}
            className="px-3 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded text-muted hover:text-red-400 hover:border-red-600 cursor-pointer"
          >
            {t('pages.settingsPage.resetAllToDefaults')}
          </button>
        </div>
      )}
    </div>
  )
}
