import { useEscapeKey } from '../../hooks/use-escape-key'
import { useT } from '../../i18n'
import { formatKeyCombo, getEffectiveShortcuts } from '../../services/keyboard-shortcuts'

interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
  context?: 'global' | 'game'
}

interface ShortcutEntry {
  keys: string
  /** Translation key resolved at render time. */
  descriptionKey: string
}

const globalShortcuts: ShortcutEntry[] = [
  { keys: 'Escape', descriptionKey: 'ui.shortcutsOverlay.global.escape' },
  { keys: 'Ctrl+S', descriptionKey: 'ui.shortcutsOverlay.global.save' },
  { keys: '?', descriptionKey: 'ui.shortcutsOverlay.global.toggleOverlay' }
]

const gameShortcuts: ShortcutEntry[] = [
  { keys: 'Space', descriptionKey: 'ui.shortcutsOverlay.game.advanceInitiative' },
  { keys: 'N', descriptionKey: 'ui.shortcutsOverlay.game.nextTurn' },
  { keys: '/', descriptionKey: 'ui.shortcutsOverlay.game.focusChat' },
  { keys: 'Home', descriptionKey: 'ui.shortcutsOverlay.game.resetMap' },
  { keys: 'F11', descriptionKey: 'ui.shortcutsOverlay.game.fullscreen' },
  { keys: 'Space + Drag', descriptionKey: 'ui.shortcutsOverlay.game.panMap' },
  { keys: 'Scroll', descriptionKey: 'ui.shortcutsOverlay.game.zoomMap' },
  { keys: 'WASD / Arrows', descriptionKey: 'ui.shortcutsOverlay.game.panMapKeys' }
]

function ShortcutRow({ keys, descriptionKey }: ShortcutEntry): JSX.Element {
  const { t } = useT()
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-300">{t(descriptionKey)}</span>
      <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-800 border border-gray-700 rounded text-gray-400">
        {keys}
      </kbd>
    </div>
  )
}

export default function ShortcutsOverlay({
  open,
  onClose,
  context = 'global'
}: ShortcutsOverlayProps): JSX.Element | null {
  const { t } = useT()
  useEscapeKey(onClose, open)

  if (!open) return null

  // Load effective shortcuts (includes user customizations)
  const effectiveShortcuts = getEffectiveShortcuts()
  const customizedShortcutMap = new Map(effectiveShortcuts.map((s) => [s.action, formatKeyCombo(s)]))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} role="presentation" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{t('ui.shortcutsOverlay.title')}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-2xl leading-none cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {t('ui.shortcutsOverlay.general')}
            </h3>
            <div className="divide-y divide-gray-800">
              {globalShortcuts.map((s) => (
                <ShortcutRow key={s.keys} {...s} />
              ))}
            </div>
          </div>

          {context === 'game' && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t('ui.shortcutsOverlay.inGame')}
              </h3>
              <div className="divide-y divide-gray-800">
                {gameShortcuts.map((s) => (
                  <ShortcutRow key={s.keys} {...s} />
                ))}
              </div>
            </div>
          )}

          {customizedShortcutMap.size > 0 && (
            <p className="text-xs text-gray-600 mt-2">
              {t('ui.shortcutsOverlay.configured', { count: effectiveShortcuts.length })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
