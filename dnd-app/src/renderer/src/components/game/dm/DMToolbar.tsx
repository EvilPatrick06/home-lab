import { useT } from '../../../i18n'

export type DmToolId = 'select' | 'token' | 'fog-reveal' | 'fog-hide' | 'measure' | 'terrain' | 'wall' | 'fill'

interface DMToolbarProps {
  activeTool: DmToolId
  onToolChange: (tool: DmToolId) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

const toolMeta: Array<{ id: DmToolId; labelKey: string; icon: string; shortcut: string }> = [
  { id: 'select', labelKey: 'game.dmToolbar.select', icon: '\u{1F5B1}', shortcut: 'V' },
  { id: 'token', labelKey: 'game.dmToolbar.token', icon: '\u{1F3AF}', shortcut: 'T' },
  { id: 'fog-reveal', labelKey: 'game.dmToolbar.revealFog', icon: '\u{1F441}', shortcut: 'R' },
  { id: 'fog-hide', labelKey: 'game.dmToolbar.hideFog', icon: '\u{1F32B}', shortcut: 'H' },
  { id: 'wall', labelKey: 'game.dmToolbar.wall', icon: '\u{1F9F1}', shortcut: 'W' },
  { id: 'measure', labelKey: 'game.dmToolbar.measure', icon: '\u{1F4CF}', shortcut: 'M' },
  { id: 'terrain', labelKey: 'game.dmToolbar.terrain', icon: '\u{1F3D4}', shortcut: 'G' },
  { id: 'fill', labelKey: 'game.dmToolbar.fillTerrain', icon: '\u{1F3A8}', shortcut: 'F' }
]

export default function DMToolbar({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}: DMToolbarProps): JSX.Element {
  const { t } = useT()
  const tools = toolMeta.map((tm) => ({ ...tm, label: t(tm.labelKey) }))
  return (
    <div className="flex flex-col gap-1 bg-gray-900 border border-gray-700 rounded-lg p-2 shadow-xl">
      <p className="text-xs text-gray-500 uppercase tracking-wider text-center mb-1">{t('game.dmToolbar.dmTools')}</p>
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          // Phase 17ae — clearer hover hint + aria-current so the active
          // tool is announced to screen readers (and visually obvious).
          title={t('game.dmToolbar.toolTooltip', { label: tool.label, shortcut: tool.shortcut })}
          aria-label={tool.label}
          aria-current={activeTool === tool.id ? 'true' : undefined}
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
            title={t('game.dmToolbar.undoTitle')}
            aria-label={t('game.dmToolbar.undo')}
            className="w-10 h-8 rounded-lg flex items-center justify-center text-sm transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            &#8630;
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title={t('game.dmToolbar.redoTitle')}
            aria-label={t('game.dmToolbar.redo')}
            className="w-10 h-8 rounded-lg flex items-center justify-center text-sm transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            &#8631;
          </button>
        </>
      )}
    </div>
  )
}
