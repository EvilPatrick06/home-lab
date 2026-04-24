import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

// Drawing tool types
export type DrawingTool = 'none' | 'highlighter' | 'pencil' | 'marker' | 'eraser'

export interface DrawingStroke {
  tool: DrawingTool
  color: string
  size: number
  opacity: number
  points: Array<{ x: number; y: number }>
}

export interface PageDrawings {
  [page: number]: DrawingStroke[]
}

interface PdfDrawingOverlayProps {
  page: number
  width: number
  height: number
  activeTool: DrawingTool
  color: string
  size: number
  strokes: DrawingStroke[]
  onStrokeComplete: (page: number, stroke: DrawingStroke) => void
}

const TOOL_SETTINGS: Record<
  DrawingTool,
  { opacity: number; compositeOp: GlobalCompositeOperation; cap: CanvasLineCap }
> = {
  none: { opacity: 1, compositeOp: 'source-over', cap: 'round' },
  highlighter: { opacity: 0.3, compositeOp: 'source-over', cap: 'square' },
  pencil: { opacity: 1.0, compositeOp: 'source-over', cap: 'round' },
  marker: { opacity: 1.0, compositeOp: 'source-over', cap: 'square' },
  eraser: { opacity: 1.0, compositeOp: 'destination-out', cap: 'round' }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawingStroke): void {
  if (stroke.points.length < 2) return
  const settings = TOOL_SETTINGS[stroke.tool]
  ctx.save()
  ctx.globalAlpha = stroke.opacity ?? settings.opacity
  ctx.globalCompositeOperation = settings.compositeOp
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.size
  ctx.lineCap = settings.cap
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  ctx.stroke()
  ctx.restore()
}

export default function PdfDrawingOverlay({
  page,
  width,
  height,
  activeTool,
  color,
  size,
  strokes,
  onStrokeComplete
}: PdfDrawingOverlayProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const currentPoints = useRef<Array<{ x: number; y: number }>>([])
  const animFrameRef = useRef<number>(0)

  // Redraw all saved strokes + optional in-progress stroke
  const redrawAll = useCallback(
    (inProgressStroke?: DrawingStroke) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const stroke of strokes) {
        drawStroke(ctx, stroke)
      }
      if (inProgressStroke) {
        drawStroke(ctx, inProgressStroke)
      }
    },
    [strokes]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = width
    canvas.height = height
    redrawAll()
  }, [width, height, redrawAll])

  useEffect(() => {
    redrawAll()
  }, [redrawAll])

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }, [])

  const buildCurrentStroke = useCallback((): DrawingStroke | undefined => {
    if (activeTool === 'none' || currentPoints.current.length < 2) return undefined
    const settings = TOOL_SETTINGS[activeTool]
    return {
      tool: activeTool,
      color,
      size,
      opacity: settings.opacity,
      points: [...currentPoints.current]
    }
  }, [activeTool, color, size])

  const scheduleRedraw = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(() => {
      redrawAll(buildCurrentStroke())
    })
  }, [redrawAll, buildCurrentStroke])

  const handleStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (activeTool === 'none') return
      e.preventDefault()
      e.stopPropagation()
      isDrawing.current = true
      currentPoints.current = [getPos(e)]
    },
    [activeTool, getPos]
  )

  const handleMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing.current || activeTool === 'none') return
      e.preventDefault()
      e.stopPropagation()
      currentPoints.current.push(getPos(e))
      scheduleRedraw()
    },
    [activeTool, getPos, scheduleRedraw]
  )

  const handleEnd = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing.current || activeTool === 'none') return
      e.preventDefault()
      e.stopPropagation()
      isDrawing.current = false
      cancelAnimationFrame(animFrameRef.current)

      const stroke = buildCurrentStroke()
      if (stroke) {
        onStrokeComplete(page, stroke)
      }
      currentPoints.current = []
    },
    [activeTool, page, onStrokeComplete, buildCurrentStroke]
  )

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        cursor: activeTool === 'none' ? 'default' : 'crosshair',
        pointerEvents: activeTool === 'none' ? 'none' : 'auto',
        touchAction: activeTool === 'none' ? 'auto' : 'none'
      }}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
    />
  )
}

// Drawing toolbar component
interface DrawingToolbarProps {
  activeTool: DrawingTool
  color: string
  size: number
  onToolChange: (tool: DrawingTool) => void
  onColorChange: (color: string) => void
  onSizeChange: (size: number) => void
  onUndo: () => void
  onRedo: () => void
  onClearPage: () => void
  hasStrokes: boolean
  hasRedo: boolean
}

const TOOL_COLORS = [
  '#FACC15', // yellow
  '#FB923C', // orange
  '#F87171', // red
  '#A78BFA', // purple
  '#60A5FA', // blue
  '#34D399', // green
  '#F472B6', // pink
  '#FFFFFF', // white
  '#000000' // black
]

const TOOL_SIZES: Record<DrawingTool, number[]> = {
  none: [],
  highlighter: [12, 20, 30, 40],
  pencil: [1, 2, 3, 5],
  marker: [4, 8, 12, 16],
  eraser: [10, 20, 30, 50]
}

export function DrawingToolbar({
  activeTool,
  color,
  size,
  onToolChange,
  onColorChange,
  onSizeChange,
  onUndo,
  onRedo,
  onClearPage,
  hasStrokes,
  hasRedo
}: DrawingToolbarProps): JSX.Element {
  const [showPicker, setShowPicker] = useState(false)

  const tools: Array<{ id: DrawingTool; label: string; icon: React.ReactNode }> = [
    { id: 'highlighter', label: 'Highlighter', icon: '🖍️' },
    { id: 'pencil', label: 'Pencil', icon: '✏️' },
    { id: 'marker', label: 'Marker', icon: '🖊️' },
    {
      id: 'eraser',
      label: 'Eraser',
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#E8998D"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0L21 5.2c.8.8.8 2 0 2.8L12 17" />
          <path d="M6 11l5 5" />
        </svg>
      )
    }
  ]

  const sizes = activeTool !== 'none' ? TOOL_SIZES[activeTool] : []

  return (
    <div className="flex items-center gap-1 relative">
      {/* Tool buttons */}
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(activeTool === tool.id ? 'none' : tool.id)}
          className={`px-2 py-1 rounded text-sm transition-colors ${
            activeTool === tool.id ? 'bg-amber-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
          }`}
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}

      {/* Color & size picker toggle */}
      {activeTool !== 'none' && (
        <>
          <div className="w-px h-6 bg-gray-700 mx-1" />
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors flex items-center gap-1"
            title={activeTool === 'eraser' ? 'Size' : 'Color & Size'}
          >
            {activeTool !== 'eraser' && (
              <span
                className="w-4 h-4 rounded-full border border-gray-600 inline-block"
                style={{ backgroundColor: color }}
              />
            )}
            <span className="text-gray-400 text-xs">{size}px</span>
          </button>
        </>
      )}

      {/* Undo / Redo / Clear — always visible */}
      <div className="w-px h-6 bg-gray-700 mx-1" />
      <button
        onClick={onUndo}
        disabled={!hasStrokes}
        className={`px-2 py-1 rounded text-sm transition-colors ${
          hasStrokes ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
        }`}
        title="Undo last stroke"
      >
        ↩
      </button>
      <button
        onClick={onRedo}
        disabled={!hasRedo}
        className={`px-2 py-1 rounded text-sm transition-colors ${
          hasRedo ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
        }`}
        title="Redo stroke"
      >
        ↪
      </button>
      <button
        onClick={onClearPage}
        disabled={!hasStrokes}
        className={`px-2 py-1 rounded text-sm transition-colors ${
          hasStrokes
            ? 'bg-gray-800 hover:bg-red-900/50 text-gray-300 hover:text-red-300'
            : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
        }`}
        title="Clear page drawings"
      >
        🗑️
      </button>

      {/* Dropdown picker */}
      {showPicker && activeTool !== 'none' && (
        <div className="absolute top-full left-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 z-50 min-w-48">
          {/* Colors — hidden for eraser */}
          {activeTool !== 'eraser' && (
            <>
              <p className="text-[10px] text-gray-500 uppercase mb-1">Color</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {TOOL_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      onColorChange(c)
                    }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      c === color ? 'border-amber-400 scale-110' : 'border-gray-600'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {/* Color wheel + hex input */}
              <div className="flex items-center gap-2 mb-3">
                <label
                  className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-gray-600 cursor-pointer hover:border-amber-400 transition-colors"
                  title="Pick any color"
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <span
                    className="block w-full h-full"
                    style={{
                      background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)'
                    }}
                  />
                </label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => {
                    const v = e.target.value
                    if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onColorChange(v)
                  }}
                  onBlur={(e) => {
                    const v = e.target.value
                    if (!/^#[0-9a-fA-F]{6}$/.test(v)) onColorChange('#FACC15')
                  }}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 w-20 font-mono focus:border-amber-500 focus:outline-none"
                  placeholder="#FF00FF"
                  maxLength={7}
                />
              </div>
            </>
          )}

          {/* Sizes */}
          <p className="text-[10px] text-gray-500 uppercase mb-1">Size</p>
          <div className="flex items-center gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                onClick={() => {
                  onSizeChange(s)
                }}
                className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
                  s === size
                    ? 'bg-amber-600/30 border border-amber-500'
                    : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'
                }`}
                title={`${s}px`}
              >
                <span
                  className="rounded-full bg-current"
                  style={{
                    width: Math.min(s, 20),
                    height: Math.min(s, 20),
                    color: activeTool === 'eraser' ? '#9CA3AF' : color
                  }}
                />
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowPicker(false)}
            className="mt-2 w-full text-xs text-gray-400 hover:text-gray-200 py-1"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
