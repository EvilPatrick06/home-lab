import { useEffect } from 'react'
import type { ShortcutDefinition } from '../../../../services/keyboard-shortcuts'
import { formatKeyCombo, getShortcutsByCategory } from '../../../../services/keyboard-shortcuts'

interface ShortcutReferenceModalProps {
  onClose: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  combat: 'Combat',
  navigation: 'Navigation',
  tools: 'Tools',
  general: 'General'
}

const CATEGORY_ORDER = ['combat', 'navigation', 'tools', 'general']

function KeyCombo({ shortcut }: { shortcut: ShortcutDefinition }): JSX.Element {
  const combo = formatKeyCombo(shortcut)
  const parts = combo.split('+')

  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <span className="text-gray-600 text-xs mx-0.5">+</span>}
          <kbd className="inline-flex items-center justify-center min-w-[1.75rem] px-2 py-1 text-xs font-mono font-semibold text-amber-400 bg-gray-800 border border-gray-600 rounded-md shadow-sm">
            {part}
          </kbd>
        </span>
      ))}
    </span>
  )
}

export default function ShortcutReferenceModal({ onClose }: ShortcutReferenceModalProps): JSX.Element {
  const grouped = getShortcutsByCategory()

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-amber-400">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Shortcut Categories */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {CATEGORY_ORDER.map((categoryKey) => {
            const shortcuts = grouped[categoryKey]
            if (!shortcuts || shortcuts.length === 0) return null
            return (
              <div key={categoryKey}>
                <h3 className="text-sm font-semibold text-amber-400/80 uppercase tracking-wider mb-2">
                  {CATEGORY_LABELS[categoryKey] ?? categoryKey}
                </h3>
                <div className="space-y-1">
                  {shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.action}
                      className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-gray-800/50 transition-colors"
                    >
                      <span className="text-sm text-gray-300">{shortcut.description}</span>
                      <KeyCombo shortcut={shortcut} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">
            Press{' '}
            <kbd className="px-1.5 py-0.5 text-xs font-mono text-amber-400 bg-gray-800 border border-gray-600 rounded">
              /
            </kbd>{' '}
            anytime to toggle this reference
          </p>
        </div>
      </div>
    </div>
  )
}
