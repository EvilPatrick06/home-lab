import { useState } from 'react'

interface ResizeMapModalProps {
  currentWidthPixels: number
  currentHeightPixels: number
  cellSize: number
  onResize: (newWidthCells: number, newHeightCells: number) => void
  onClose: () => void
}

export default function ResizeMapModal({
  currentWidthPixels,
  currentHeightPixels,
  cellSize,
  onResize,
  onClose
}: ResizeMapModalProps): JSX.Element {
  const [width, setWidth] = useState(Math.round(currentWidthPixels / cellSize))
  const [height, setHeight] = useState(Math.round(currentHeightPixels / cellSize))

  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

  const handleResize = (): void => {
    onResize(clamp(width, 10, 100), clamp(height, 10, 100))
  }

  const newPixelWidth = clamp(width, 10, 100) * cellSize
  const newPixelHeight = clamp(height, 10, 100) * cellSize

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">Resize Map</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Current size: {Math.round(currentWidthPixels / cellSize)} x {Math.round(currentHeightPixels / cellSize)}{' '}
            cells
          </p>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">New Width (cells)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(clamp(parseInt(e.target.value, 10) || 10, 10, 200))}
                min={10}
                max={200}
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">New Height (cells)</label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(clamp(parseInt(e.target.value, 10) || 10, 10, 200))}
                min={10}
                max={200}
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <p className="text-[10px] text-gray-500">
            Total size: {newPixelWidth} x {newPixelHeight} px
          </p>
          <p className="text-[10px] text-amber-500/80">
            Note: Content outside the new bounds boundaries will be hidden but preserved. Background maps will not
            resize.
          </p>

          <button
            onClick={handleResize}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
          >
            Apply Resize
          </button>
        </div>
      </div>
    </div>
  )
}
