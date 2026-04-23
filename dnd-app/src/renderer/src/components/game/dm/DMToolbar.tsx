export type DmToolId = 'select' | 'token' | 'fog-reveal' | 'fog-hide' | 'measure' | 'terrain' | 'wall' | 'fill'

interface DMToolbarProps {
  activeTool: DmToolId
  onToolChange: (tool: DmToolId) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

const tools: Array<{ id: DmToolId; label: string; icon: string; shortcut: string }> = [
  { id: 'select', label: 'Select', icon: '\u{1F5B1}', shortcut: 'V' },
  { id: 'token', label: 'Token', icon: '\u{1F3AF}', shortcut: 'T' },
  { id: 'fog-reveal', label: 'Reveal Fog', icon: '\u{1F441}', shortcut: 'R' },
  { id: 'fog-hide', label: 'Hide Fog', icon: '\u{1F32B}', shortcut: 'H' },
  { id: 'wall', label: 'Wall', icon: '\u{1F9F1}', shortcut: 'W' },
  { id: 'measure', label: 'Measure', icon: '\u{1F4CF}', shortcut: 'M' },
  { id: 'terrain', label: 'Terrain', icon: '\u{1F3D4}', shortcut: 'G' },
  { id: 'fill', label: 'Fill Terrain', icon: '\u{1F3A8}', shortcut: 'F' }
]

export default function DMToolbar({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}: DMToolbarProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1 bg-gray-900 border border-gray-700 rounded-lg p-2 shadow-xl">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider text-center mb-1">DM Tools</p>
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          aria-label={tool.label}
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors cursor-pointer
            ${
              activeTool === tool.id ? 'bg-amber-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
        >
          {tool.icon}
        </button>
      ))}

      {/* Undo/Redo buttons */}
      {(onUndo || onRedo) && (
        <>
          <div className="border-t border-gray-700/50 my-1" />
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="w-10 h-8 rounded-lg flex items-center justify-center text-sm transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            &#8630;
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="w-10 h-8 rounded-lg flex items-center justify-center text-sm transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            &#8631;
          </button>
        </>
      )}
    </div>
  )
}
