import { formatKeyCombo, getEffectiveShortcuts } from '../../services/keyboard-shortcuts'

interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
  context?: 'global' | 'game'
}

interface ShortcutEntry {
  keys: string
  description: string
}

const globalShortcuts: ShortcutEntry[] = [
  { keys: 'Escape', description: 'Close topmost modal or panel' },
  { keys: 'Ctrl+S', description: 'Save character or campaign' },
  { keys: '?', description: 'Toggle this shortcuts overlay' }
]

const gameShortcuts: ShortcutEntry[] = [
  { keys: 'Space', description: 'Advance initiative (when focused)' },
  { keys: 'N', description: 'Next turn (DM only)' },
  { keys: '/', description: 'Focus chat input' },
  { keys: 'Home', description: 'Reset map view' },
  { keys: 'F11', description: 'Toggle fullscreen' },
  { keys: 'Space + Drag', description: 'Pan map' },
  { keys: 'Scroll', description: 'Zoom map' },
  { keys: 'WASD / Arrows', description: 'Pan map (hold Space)' }
]

function ShortcutRow({ keys, description }: ShortcutEntry): JSX.Element {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-300">{description}</span>
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
  if (!open) return null

  // Load effective shortcuts (includes user customizations)
  const effectiveShortcuts = getEffectiveShortcuts()
  const customizedShortcutMap = new Map(effectiveShortcuts.map((s) => [s.action, formatKeyCombo(s)]))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-2xl leading-none cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">General</h3>
            <div className="divide-y divide-gray-800">
              {globalShortcuts.map((s) => (
                <ShortcutRow key={s.keys} {...s} />
              ))}
            </div>
          </div>

          {context === 'game' && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">In-Game</h3>
              <div className="divide-y divide-gray-800">
                {gameShortcuts.map((s) => (
                  <ShortcutRow key={s.keys} {...s} />
                ))}
              </div>
            </div>
          )}

          {customizedShortcutMap.size > 0 && (
            <p className="text-[10px] text-gray-600 mt-2">
              {effectiveShortcuts.length} shortcuts configured. Customize in Settings &gt; Keybindings.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
