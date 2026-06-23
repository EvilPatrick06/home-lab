import { useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'

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
  const { t } = useT()
  const [width, setWidth] = useState(Math.round(currentWidthPixels / cellSize))
  const [height, setHeight] = useState(Math.round(currentHeightPixels / cellSize))

  useEscapeKey(onClose)

  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

  const handleResize = (): void => {
    onResize(clamp(width, 10, 100), clamp(height, 10, 100))
  }

  const newPixelWidth = clamp(width, 10, 100) * cellSize
  const newPixelHeight = clamp(height, 10, 100) * cellSize

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-surface/95 backdrop-blur-sm border border-border/50 rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">{t('game.resizeMapModal.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-muted">
            {t('game.resizeMapModal.currentSize', {
              width: Math.round(currentWidthPixels / cellSize),
              height: Math.round(currentHeightPixels / cellSize)
            })}
          </p>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted block mb-1">{t('game.resizeMapModal.newWidth')}</label>
              <input
                type="number"
                name="map-width"
                value={width}
                onChange={(e) => setWidth(clamp(parseInt(e.target.value, 10) || 10, 10, 200))}
                min={10}
                max={200}
                className="w-full px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-fg text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted block mb-1">{t('game.resizeMapModal.newHeight')}</label>
              <input
                type="number"
                name="map-height"
                value={height}
                onChange={(e) => setHeight(clamp(parseInt(e.target.value, 10) || 10, 10, 200))}
                min={10}
                max={200}
                className="w-full px-2 py-1.5 rounded-lg bg-surface-2 border border-border text-fg text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {t('game.resizeMapModal.totalSize', { width: newPixelWidth, height: newPixelHeight })}
          </p>
          <p className="text-xs text-accent-strong/80">{t('game.resizeMapModal.note')}</p>

          <button
            onClick={handleResize}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-accent-strong text-white transition-colors cursor-pointer"
          >
            {t('game.resizeMapModal.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
