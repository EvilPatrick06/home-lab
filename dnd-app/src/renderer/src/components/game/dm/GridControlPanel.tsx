import { useT } from '../../../i18n'
import type { GridSettings } from '../../../types/map'

const DEFAULT_CELL_SIZE = 40

interface GridControlPanelProps {
  grid: GridSettings
  onUpdate: (updates: Partial<GridSettings>) => void
}

export default function GridControlPanel({ grid, onUpdate }: GridControlPanelProps): JSX.Element {
  const { t } = useT()
  const handleResetToDefault = (): void => {
    onUpdate({ cellSize: DEFAULT_CELL_SIZE, offsetX: 0, offsetY: 0 })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-200">{t('game.gridControlPanel.title')}</h4>
        <button
          onClick={handleResetToDefault}
          className="px-2 py-0.5 text-xs rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer"
          title={t('game.gridControlPanel.resetTitle')}
        >
          {t('game.gridControlPanel.resetToDefault')}
        </button>
      </div>

      {/* Cell Size */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400 uppercase tracking-wider">
          {t('game.gridControlPanel.cellSize', { size: grid.cellSize })}
        </label>
        <input
          type="range"
          min={20}
          max={100}
          value={grid.cellSize}
          onChange={(e) => onUpdate({ cellSize: parseInt(e.target.value, 10) })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-[9px] text-gray-600">
          <span>20</span>
          <span>100</span>
        </div>
      </div>

      {/* X Offset */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400 uppercase tracking-wider">
          {t('game.gridControlPanel.xOffset', { offset: grid.offsetX })}
        </label>
        <input
          type="range"
          min={-50}
          max={50}
          value={grid.offsetX}
          onChange={(e) => onUpdate({ offsetX: parseInt(e.target.value, 10) })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-[9px] text-gray-600">
          <span>-50</span>
          <span>50</span>
        </div>
      </div>

      {/* Y Offset */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400 uppercase tracking-wider">
          {t('game.gridControlPanel.yOffset', { offset: grid.offsetY })}
        </label>
        <input
          type="range"
          min={-50}
          max={50}
          value={grid.offsetY}
          onChange={(e) => onUpdate({ offsetY: parseInt(e.target.value, 10) })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-[9px] text-gray-600">
          <span>-50</span>
          <span>50</span>
        </div>
      </div>

      {/* Grid Color */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400 uppercase tracking-wider">{t('game.gridControlPanel.gridColor')}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={grid.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-8 h-8 rounded border border-gray-700 bg-gray-900 cursor-pointer"
          />
          <span className="text-xs text-gray-400">{grid.color}</span>
        </div>
      </div>

      {/* Opacity */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400 uppercase tracking-wider">
          {t('game.gridControlPanel.opacity', { percent: Math.round(grid.opacity * 100) })}
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(grid.opacity * 100)}
          onChange={(e) => onUpdate({ opacity: parseInt(e.target.value, 10) / 100 })}
          className="w-full accent-amber-500"
        />
      </div>

      {/* Grid Type */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400 uppercase tracking-wider">{t('game.gridControlPanel.gridType')}</label>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => onUpdate({ type: 'square' })}
            className={`flex-1 min-w-[60px] py-1.5 text-xs rounded cursor-pointer transition-colors ${
              grid.type === 'square' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {t('game.gridControlPanel.square')}
          </button>
          <button
            onClick={() => onUpdate({ type: 'hex' })}
            className={`flex-1 min-w-[60px] py-1.5 text-xs rounded cursor-pointer transition-colors ${
              grid.type === 'hex' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {t('game.gridControlPanel.hex')}
          </button>
          <button
            onClick={() => onUpdate({ type: 'gridless' })}
            className={`flex-1 min-w-[60px] py-1.5 text-xs rounded cursor-pointer transition-colors ${
              grid.type === 'gridless' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {t('game.gridControlPanel.gridless')}
          </button>
        </div>
      </div>

      {/* Toggle Grid */}
      <button
        onClick={() => onUpdate({ enabled: !grid.enabled })}
        className={`w-full py-1.5 text-xs rounded border transition-colors cursor-pointer ${
          grid.enabled ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'
        }`}
      >
        {grid.enabled ? t('game.gridControlPanel.gridOn') : t('game.gridControlPanel.gridOff')}
      </button>
    </div>
  )
}
