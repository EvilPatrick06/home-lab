import { useT } from '../../../i18n'
import type { DmToolId } from './DMToolbar'

interface FogBrushProps {
  activeTool: DmToolId
  brushSize: number
  onToolChange: (tool: 'fog-reveal' | 'fog-hide') => void
  onBrushSizeChange: (size: number) => void
  onRevealAll: () => void
  onHideAll: () => void
  dynamicFogEnabled?: boolean
  onDynamicFogToggle?: (enabled: boolean) => void
}

export default function FogBrush({
  activeTool,
  brushSize,
  onToolChange,
  onBrushSizeChange,
  onRevealAll,
  onHideAll,
  dynamicFogEnabled,
  onDynamicFogToggle
}: FogBrushProps): JSX.Element {
  const { t } = useT()
  const isFogTool = activeTool === 'fog-reveal' || activeTool === 'fog-hide'
  const brushSizes = [1, 3, 5]

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{t('game.fogBrush.title')}</h3>

      <div className="flex gap-1">
        <button
          onClick={() => onToolChange('fog-reveal')}
          className={`flex-1 py-2 text-sm rounded-lg transition-colors cursor-pointer
            ${activeTool === 'fog-reveal' ? 'bg-green-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'}`}
        >
          {t('game.fogBrush.reveal')}
        </button>
        <button
          onClick={() => onToolChange('fog-hide')}
          className={`flex-1 py-2 text-sm rounded-lg transition-colors cursor-pointer
            ${activeTool === 'fog-hide' ? 'bg-red-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'}`}
        >
          {t('game.fogBrush.hide')}
        </button>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('game.fogBrush.brushSize')}</label>
        <div className="flex gap-1">
          {brushSizes.map((size) => (
            <button
              key={size}
              onClick={() => onBrushSizeChange(size)}
              className={`flex-1 py-1.5 text-sm rounded-lg transition-colors cursor-pointer
                ${brushSize === size ? 'bg-amber-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'}`}
            >
              {size}x{size}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onRevealAll}
          className="flex-1 py-1.5 text-xs rounded-lg bg-surface-2 text-muted
            hover:bg-green-700 hover:text-white transition-colors cursor-pointer"
        >
          {t('game.fogBrush.revealAll')}
        </button>
        <button
          onClick={onHideAll}
          className="flex-1 py-1.5 text-xs rounded-lg bg-surface-2 text-muted
            hover:bg-red-700 hover:text-white transition-colors cursor-pointer"
        >
          {t('game.fogBrush.hideAll')}
        </button>
      </div>

      {onDynamicFogToggle && (
        <label className="flex items-center gap-2 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={dynamicFogEnabled ?? false}
            onChange={(e) => onDynamicFogToggle(e.target.checked)}
            className="accent-cyan-500 w-3.5 h-3.5 cursor-pointer"
          />
          <span className="text-xs text-muted">{t('game.fogBrush.dynamicVision')}</span>
        </label>
      )}

      {isFogTool && (
        <p className="text-xs text-accent text-center">
          {activeTool === 'fog-reveal' ? t('game.fogBrush.dragToReveal') : t('game.fogBrush.dragToHide')}
        </p>
      )}
    </div>
  )
}
