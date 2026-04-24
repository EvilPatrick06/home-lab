import type { GridSettings } from '../../../types/map'

const DEFAULT_CELL_SIZE = 40

interface GridControlPanelProps {
  grid: GridSettings
  onUpdate: (updates: Partial<GridSettings>) => void
}

export default function GridControlPanel({ grid, onUpdate }: GridControlPanelProps): JSX.Element {
  const handleResetToDefault = (): void => {
    onUpdate({ cellSize: DEFAULT_CELL_SIZE, offsetX: 0, offsetY: 0 })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-200">Grid Settings</h4>
        <button
          onClick={handleResetToDefault}
          className="px-2 py-0.5 text-[10px] rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer"
          title="Reset cell size to 40px and offsets to 0"
        >
          Reset to Default (40px)
        </button>
      </div>

      {/* Cell Size */}
      <div className="space-y-1">
        <label className="text-[10px] text-gray-400 uppercase tracking-wider">Cell Size: {grid.cellSize}px</label>
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
        <label className="text-[10px] text-gray-400 uppercase tracking-wider">X Offset: {grid.offsetX}px</label>
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
        <label className="text-[10px] text-gray-400 uppercase tracking-wider">Y Offset: {grid.offsetY}px</label>
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
        <label className="text-[10px] text-gray-400 uppercase tracking-wider">Grid Color</label>
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
        <label className="text-[10px] text-gray-400 uppercase tracking-wider">
          Opacity: {Math.round(grid.opacity * 100)}%
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
        <label className="text-[10px] text-gray-400 uppercase tracking-wider">Grid Type</label>
        <div className="flex gap-1">
          <button
            onClick={() => onUpdate({ type: 'square' })}
            className={`flex-1 py-1.5 text-xs rounded cursor-pointer transition-colors ${
              grid.type === 'square' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Square
          </button>
          <button
            onClick={() => onUpdate({ type: 'hex' })}
            className={`flex-1 py-1.5 text-xs rounded cursor-pointer transition-colors ${
              grid.type === 'hex' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Hex
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
        Grid {grid.enabled ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}
