import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_CELL_SIZE = 40

interface CreateMapConfig {
  name: string
  width: number
  height: number
  cellSize: number
  gridType: 'square' | 'hex'
  backgroundColor: string
  imageData?: string
}

interface CreateMapModalProps {
  onCreateMap: (config: CreateMapConfig) => void
  onClose: () => void
}

/** Draws a grid overlay preview onto a canvas element */
function drawGridPreview(
  canvas: HTMLCanvasElement,
  cellSize: number,
  gridType: 'square' | 'hex',
  bgColor: string,
  imageData: string | null
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height

  // Clear and draw background
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, w, h)

  // Draw uploaded image if available
  if (imageData) {
    const img = new Image()
    img.src = imageData
    // Draw synchronously only if already loaded (cached)
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, w, h)
    }
  }

  // Draw semi-transparent grid overlay
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 1

  // Scale cell size to preview canvas (preview is 320x200, representing the map)
  const scaledCell = cellSize * (w / 1200)
  if (scaledCell < 2) return // too small to draw

  if (gridType === 'square') {
    ctx.beginPath()
    for (let x = scaledCell; x < w; x += scaledCell) {
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, h)
    }
    for (let y = scaledCell; y < h; y += scaledCell) {
      ctx.moveTo(0, Math.round(y) + 0.5)
      ctx.lineTo(w, Math.round(y) + 0.5)
    }
    ctx.stroke()
  } else {
    // Hex grid preview
    const hexW = scaledCell
    const hexH = scaledCell * 0.866
    ctx.beginPath()
    for (let row = 0; row * hexH < h + hexH; row++) {
      const xOff = row % 2 === 1 ? hexW / 2 : 0
      for (let col = -1; col * hexW < w + hexW; col++) {
        const cx = col * hexW + xOff
        const cy = row * hexH
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6
          const px = cx + (scaledCell / 2) * Math.cos(angle)
          const py = cy + (scaledCell / 2) * Math.sin(angle)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
      }
    }
    ctx.stroke()
  }
}

export default function CreateMapModal({ onCreateMap, onClose }: CreateMapModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [width, setWidth] = useState(30)
  const [height, setHeight] = useState(30)
  const [cellSize, setCellSize] = useState(DEFAULT_CELL_SIZE)
  const [gridType, setGridType] = useState<'square' | 'hex'>('square')
  const [backgroundColor, setBackgroundColor] = useState('#111827')
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

  // Redraw grid preview whenever relevant settings change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (uploadedImage) {
      const img = new Image()
      img.onload = () => drawGridPreview(canvas, cellSize, gridType, backgroundColor, uploadedImage)
      img.src = uploadedImage
      // Also draw immediately in case image is cached
      drawGridPreview(canvas, cellSize, gridType, backgroundColor, uploadedImage)
    } else {
      drawGridPreview(canvas, cellSize, gridType, backgroundColor, null)
    }
  }, [cellSize, gridType, backgroundColor, uploadedImage])

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = () => {
      setUploadedImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleCreate = (): void => {
    onCreateMap({
      name: name.trim() || 'Untitled Map',
      width: clamp(width, 10, 100),
      height: clamp(height, 10, 100),
      cellSize: clamp(cellSize, 20, 100),
      gridType,
      backgroundColor,
      imageData: uploadedImage ?? undefined
    })
  }

  const totalPixelWidth = clamp(width, 10, 100) * clamp(cellSize, 20, 100)
  const totalPixelHeight = clamp(height, 10, 100) * clamp(cellSize, 20, 100)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-5 max-w-md w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">Create New Map</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          {/* Map Name */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Map Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dungeon Level 1"
              className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Upload Custom Image */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Custom Map Image (optional)</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors cursor-pointer"
              >
                Choose Image
              </button>
              {uploadedImage && (
                <button
                  onClick={() => setUploadedImage(null)}
                  className="px-2 py-1.5 text-xs rounded-lg bg-red-900/30 border border-red-800 text-red-300 hover:bg-red-900/50 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              )}
              <span className="text-[10px] text-gray-500 truncate">
                {uploadedImage ? 'Image loaded' : 'PNG, JPG, or WebP'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Grid Alignment Preview */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Grid Alignment Preview</label>
            <div className="rounded-lg border border-gray-700 overflow-hidden">
              <canvas ref={canvasRef} width={320} height={200} className="w-full h-auto block" />
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              Adjust cell size below to align the grid with your map image
            </p>
          </div>

          {/* Width and Height */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Width (cells)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(clamp(parseInt(e.target.value, 10) || 10, 10, 100))}
                min={10}
                max={100}
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Height (cells)</label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(clamp(parseInt(e.target.value, 10) || 10, 10, 100))}
                min={10}
                max={100}
                className="w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Cell Size — Slider + Number Input + Reset */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">Cell Size: {cellSize}px</label>
              <button
                onClick={() => setCellSize(DEFAULT_CELL_SIZE)}
                className={`px-2 py-0.5 text-[10px] rounded bg-gray-800 border transition-colors cursor-pointer ${
                  cellSize === DEFAULT_CELL_SIZE
                    ? 'border-amber-500/50 text-amber-300'
                    : 'border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                Reset to Default (40px)
              </button>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              value={cellSize}
              onChange={(e) => setCellSize(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500"
            />
            <div className="flex items-center justify-between mt-1">
              <div className="flex justify-between text-[9px] text-gray-600 flex-1">
                <span>20px</span>
                <span>100px</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Total: {totalPixelWidth} x {totalPixelHeight} px
            </p>
          </div>

          {/* Grid Type */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Grid Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setGridType('square')}
                className={`flex-1 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                  gridType === 'square'
                    ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                Square
              </button>
              <button
                onClick={() => setGridType('hex')}
                className={`flex-1 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                  gridType === 'hex'
                    ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                Hex
              </button>
            </div>
          </div>

          {/* Background Color */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Background Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-700 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Size Presets */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Quick Presets</label>
            <div className="flex gap-1">
              {[
                { label: 'Small', w: 20, h: 20 },
                { label: 'Medium', w: 30, h: 30 },
                { label: 'Large', w: 50, h: 50 },
                { label: 'Wide', w: 60, h: 30 }
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setWidth(preset.w)
                    setHeight(preset.h)
                  }}
                  className={`flex-1 py-1 text-[10px] rounded transition-colors cursor-pointer ${
                    width === preset.w && height === preset.h
                      ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  {preset.label}
                  <span className="block text-gray-500">
                    {preset.w}x{preset.h}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Create Button */}
          <button
            onClick={handleCreate}
            className="w-full py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
          >
            Create Map
          </button>
        </div>
      </div>
    </div>
  )
}
