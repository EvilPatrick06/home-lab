import { useT } from '../../../i18n'
import { useGameStore } from '../../../stores/use-game-store'

// --- Time Request Toast ---
interface TimeRequestToastProps {
  toast: { requesterId: string; requesterName: string }
  onDismiss: () => void
}

export function TimeRequestToast({ toast, onDismiss }: TimeRequestToastProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="fixed top-28 start-1/2 -translate-x-1/2 z-40">
      <div className="bg-surface border border-cyan-500/50 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
        <span className="text-xs text-gray-200">
          {t('game.timeRequestToast.message', { name: toast.requesterName })}
        </span>
        <button
          onClick={onDismiss}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
        >
          {t('game.timeRequestToast.dismiss')}
        </button>
      </div>
    </div>
  )
}

// --- Rest Request Toast ---
interface RestRequestToastProps {
  toast: { playerName: string; restType: 'short' | 'long' }
  onDismiss: () => void
  onShortRest: () => void
  onLongRest: () => void
}

export function RestRequestToast({ toast, onDismiss, onShortRest, onLongRest }: RestRequestToastProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="fixed top-28 start-1/2 -translate-x-1/2 z-40">
      <div className="bg-surface border border-green-500/50 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
        <span className="text-xs text-gray-200">
          {t('game.restRequestToast.message', {
            name: toast.playerName,
            restType: toast.restType === 'short' ? t('game.restRequestToast.short') : t('game.restRequestToast.long')
          })}
        </span>
        <button
          onClick={() => {
            onDismiss()
            if (toast.restType === 'short') onShortRest()
            else onLongRest()
          }}
          className="px-2 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded cursor-pointer"
        >
          {t('game.restRequestToast.accept')}
        </button>
        <button
          onClick={onDismiss}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
        >
          {t('game.restRequestToast.dismiss')}
        </button>
      </div>
    </div>
  )
}

// --- Phase Change Toast ---
interface PhaseChangeToastProps {
  toast: { phase: string; suggestedLight: 'bright' | 'dim' | 'darkness' }
  onDismiss: () => void
}

export function PhaseChangeToast({ toast, onDismiss }: PhaseChangeToastProps): JSX.Element {
  const { t } = useT()
  const gameStore = useGameStore()

  return (
    <div className="fixed top-16 start-1/2 -translate-x-1/2 z-40">
      <div className="bg-surface border border-purple-500/50 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
        <span className="text-xs text-gray-200">
          {t('game.phaseChangeToast.itsNow')} <span className="text-purple-300 font-semibold">{toast.phase}</span>.{' '}
          {t('game.phaseChangeToast.updateLighting')} <span className="text-amber-300">{toast.suggestedLight}</span>?
        </span>
        <button
          onClick={() => {
            gameStore.setAmbientLight(toast.suggestedLight)
            onDismiss()
          }}
          className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded cursor-pointer"
        >
          {t('game.phaseChangeToast.yes')}
        </button>
        <button
          onClick={onDismiss}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
        >
          {t('game.phaseChangeToast.no')}
        </button>
      </div>
    </div>
  )
}

// --- Long Rest Warning ---
interface LongRestWarningProps {
  onOverride: () => void
  onCancel: () => void
}

export function LongRestWarning({ onOverride, onCancel }: LongRestWarningProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="fixed top-16 start-1/2 -translate-x-1/2 z-40">
      <div className="bg-surface border border-red-500/50 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
        <span className="text-xs text-gray-200">{t('game.longRestWarning.message')}</span>
        <button
          onClick={onOverride}
          className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded cursor-pointer"
        >
          {t('game.longRestWarning.override')}
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
        >
          {t('common.actions.cancel')}
        </button>
      </div>
    </div>
  )
}

// --- AoE Dismiss Button ---
interface AoEDismissProps {
  onClear: () => void
}

export function AoEDismissButton({ onClear }: AoEDismissProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="fixed top-16 end-4 z-30">
      <button
        onClick={onClear}
        className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg cursor-pointer shadow-lg"
      >
        {t('game.aoeDismissButton.clear')}
      </button>
    </div>
  )
}

// --- Fog Toolbar ---
interface FogToolbarProps {
  activeTool: 'fog-reveal' | 'fog-hide'
  fogBrushSize: number
  onSetTool: (tool: 'select' | 'fog-reveal' | 'fog-hide') => void
  onSetBrushSize: (size: number) => void
  dynamicFogEnabled?: boolean
  onDynamicFogToggle?: (enabled: boolean) => void
}

export function FogToolbar({
  activeTool,
  fogBrushSize,
  onSetTool,
  onSetBrushSize,
  dynamicFogEnabled,
  onDynamicFogToggle
}: FogToolbarProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="absolute top-3 start-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface/90 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2">
      <button
        onClick={() => onSetTool('fog-reveal')}
        className={`px-2 py-1 text-xs rounded-lg cursor-pointer ${activeTool === 'fog-reveal' ? 'bg-green-600 text-white' : 'bg-surface-2 text-gray-300 hover:bg-gray-700'}`}
      >
        {t('game.fogToolbar.reveal')}
      </button>
      <button
        onClick={() => onSetTool('fog-hide')}
        className={`px-2 py-1 text-xs rounded-lg cursor-pointer ${activeTool === 'fog-hide' ? 'bg-red-600 text-white' : 'bg-surface-2 text-gray-300 hover:bg-gray-700'}`}
      >
        {t('game.fogToolbar.hide')}
      </button>
      <div className="border-s border-border h-5 mx-1" />
      <span className="text-xs text-muted">{t('game.fogToolbar.brush')}</span>
      {[1, 2, 3, 5].map((size) => (
        <button
          key={size}
          onClick={() => onSetBrushSize(size)}
          className={`w-6 h-6 text-xs rounded cursor-pointer ${fogBrushSize === size ? 'bg-amber-600 text-white' : 'bg-surface-2 text-gray-300 hover:bg-gray-700'}`}
        >
          {size}
        </button>
      ))}
      {onDynamicFogToggle && (
        <>
          <div className="border-s border-border h-5 mx-1" />
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              name="dynamic-fog"
              type="checkbox"
              checked={dynamicFogEnabled ?? false}
              onChange={(e) => onDynamicFogToggle(e.target.checked)}
              className="accent-cyan-500 w-3 h-3 cursor-pointer"
            />
            <span className="text-xs text-muted">{t('game.fogToolbar.dynamicVision')}</span>
          </label>
        </>
      )}
      <div className="border-s border-border h-5 mx-1" />
      <button
        onClick={() => onSetTool('select')}
        className="px-2 py-1 text-xs rounded-lg bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer"
      >
        {t('game.fogToolbar.done')}
      </button>
    </div>
  )
}

// --- Wall Toolbar ---
interface WallToolbarProps {
  wallType: 'solid' | 'door' | 'window'
  onSetWallType: (type: 'solid' | 'door' | 'window') => void
  onDone: () => void
}

export function WallToolbar({ wallType, onSetWallType, onDone }: WallToolbarProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="absolute top-3 start-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface/90 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2">
      {(['solid', 'door', 'window'] as const).map((type) => (
        <button
          key={type}
          onClick={() => onSetWallType(type)}
          className={`px-2 py-1 text-xs rounded-lg cursor-pointer capitalize ${
            wallType === type
              ? type === 'solid'
                ? 'bg-blue-600 text-white'
                : type === 'door'
                  ? 'bg-amber-600 text-white'
                  : 'bg-purple-600 text-white'
              : 'bg-surface-2 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {type}
        </button>
      ))}
      <div className="border-s border-border h-5 mx-1" />
      <span className="text-xs text-muted">{t('game.wallToolbar.instructions')}</span>
      <div className="border-s border-border h-5 mx-1" />
      <button
        onClick={onDone}
        className="px-2 py-1 text-xs rounded-lg bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer"
      >
        {t('game.wallToolbar.done')}
      </button>
    </div>
  )
}

// --- Drawing Toolbar ---
interface DrawingToolbarProps {
  activeTool: 'draw-free' | 'draw-line' | 'draw-rect' | 'draw-circle' | 'draw-text'
  strokeWidth: number
  color: string
  onSetTool: (tool: 'draw-free' | 'draw-line' | 'draw-rect' | 'draw-circle' | 'draw-text') => void
  onSetStrokeWidth: (width: number) => void
  onSetColor: (color: string) => void
  onClearDrawings?: () => void
  isHost?: boolean
}

const DRAWING_TOOLS = [
  { id: 'draw-free' as const, label: 'Free', icon: '✏️' },
  { id: 'draw-line' as const, label: 'Line', icon: '📏' },
  { id: 'draw-rect' as const, label: 'Rect', icon: '▭' },
  { id: 'draw-circle' as const, label: 'Circle', icon: '○' },
  { id: 'draw-text' as const, label: 'Text', icon: '📝' }
] as const

const DRAWING_COLORS = [
  { value: '#ffffff', label: 'White' },
  { value: '#ff0000', label: 'Red' },
  { value: '#00ff00', label: 'Green' },
  { value: '#0000ff', label: 'Blue' },
  { value: '#ffff00', label: 'Yellow' },
  { value: '#ff00ff', label: 'Magenta' },
  { value: '#00ffff', label: 'Cyan' },
  { value: '#000000', label: 'Black' }
]

export function DrawingToolbar({
  activeTool,
  strokeWidth,
  color,
  onSetTool,
  onSetStrokeWidth,
  onSetColor,
  onClearDrawings,
  isHost
}: DrawingToolbarProps): JSX.Element {
  const { t } = useT()
  const toolLabels: Record<(typeof DRAWING_TOOLS)[number]['id'], string> = {
    'draw-free': t('game.drawingToolbar.toolFree'),
    'draw-line': t('game.drawingToolbar.toolLine'),
    'draw-rect': t('game.drawingToolbar.toolRect'),
    'draw-circle': t('game.drawingToolbar.toolCircle'),
    'draw-text': t('game.drawingToolbar.toolText')
  }
  const colorLabels: Record<string, string> = {
    '#ffffff': t('game.drawingToolbar.colorWhite'),
    '#ff0000': t('game.drawingToolbar.colorRed'),
    '#00ff00': t('game.drawingToolbar.colorGreen'),
    '#0000ff': t('game.drawingToolbar.colorBlue'),
    '#ffff00': t('game.drawingToolbar.colorYellow'),
    '#ff00ff': t('game.drawingToolbar.colorMagenta'),
    '#00ffff': t('game.drawingToolbar.colorCyan'),
    '#000000': t('game.drawingToolbar.colorBlack')
  }
  return (
    <div className="absolute top-3 start-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface/90 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2">
      {DRAWING_TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onSetTool(tool.id)}
          title={toolLabels[tool.id]}
          className={`px-2 py-1 text-sm rounded-lg cursor-pointer ${
            activeTool === tool.id ? 'bg-amber-600 text-white' : 'bg-surface-2 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {tool.icon}
        </button>
      ))}

      <div className="border-s border-border h-5 mx-1" />

      <span className="text-xs text-muted">{t('game.drawingToolbar.size')}</span>
      {[1, 2, 3, 5, 8].map((size) => (
        <button
          key={size}
          onClick={() => onSetStrokeWidth(size)}
          className={`w-6 h-6 text-xs rounded cursor-pointer ${
            strokeWidth === size ? 'bg-amber-600 text-white' : 'bg-surface-2 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {size}
        </button>
      ))}

      <div className="border-s border-border h-5 mx-1" />

      <span className="text-xs text-muted">{t('game.drawingToolbar.color')}</span>
      {DRAWING_COLORS.map((c) => (
        <button
          key={c.value}
          onClick={() => onSetColor(c.value)}
          title={colorLabels[c.value] ?? c.value}
          className={`w-6 h-6 rounded cursor-pointer border-2 ${
            color === c.value ? 'border-amber-500' : 'border-gray-600'
          }`}
          style={{ backgroundColor: c.value }}
        />
      ))}

      {isHost && onClearDrawings && (
        <>
          <div className="border-s border-border h-5 mx-1" />
          <button
            onClick={onClearDrawings}
            title={t('game.drawingToolbar.clearAll')}
            className="px-2 py-1 text-xs rounded-lg bg-red-900/50 text-red-300 hover:bg-red-800/60 cursor-pointer"
          >
            {t('game.drawingToolbar.clear')}
          </button>
        </>
      )}
    </div>
  )
}
