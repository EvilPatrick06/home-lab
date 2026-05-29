import { Circle, Pencil, Ruler, Square, Type } from 'lucide-react'
import { Z } from '../../../constants'
import { Tooltip } from '../../ui'
import type { MapTool } from './types'

interface DrawingToolPickerProps {
  /** Selects a drawing tool (draw-free / draw-line / draw-rect / draw-circle / draw-text). */
  onSetTool: (tool: MapTool) => void
}

/**
 * DM-only drawing-tool launcher column, shown when activeTool === 'select'.
 * Extracted verbatim from GameLayout — same markup, labels, and hotkey hints.
 * Phase 14b (D2): the caller still gates rendering on effectiveIsDM.
 */
export default function DrawingToolPicker({ onSetTool }: DrawingToolPickerProps): JSX.Element {
  return (
    <div
      className="absolute top-16 right-4 flex flex-col gap-1 bg-gray-900/90 backdrop-blur-sm border border-gray-700/50 rounded-xl p-2 shadow-xl"
      style={{ zIndex: Z.TOOLBAR }}
      role="toolbar"
      aria-label="Drawing tools"
    >
      <p className="text-xs text-gray-500 uppercase tracking-wider text-center mb-1">Drawing</p>
      <Tooltip text="Free Draw (F)">
        <button
          onClick={() => onSetTool('draw-free')}
          aria-label="Free draw"
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Pencil className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text="Draw Line (L)">
        <button
          onClick={() => onSetTool('draw-line')}
          aria-label="Draw line"
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Ruler className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text="Draw Rectangle (R)">
        <button
          onClick={() => onSetTool('draw-rect')}
          aria-label="Draw rectangle"
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Square className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text="Draw Circle (C)">
        <button
          onClick={() => onSetTool('draw-circle')}
          aria-label="Draw circle"
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Circle className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text="Add Text (T)">
        <button
          onClick={() => onSetTool('draw-text')}
          aria-label="Add text"
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Type className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  )
}
